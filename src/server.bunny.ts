import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { authenticate, type AuthResult, oidcConfigFromEnv } from "./platform/oidc.server";
import { type Database, setPlatform } from "./platform/platform.server";
import { handleRequest } from "./server";
import { userFromEmail } from "./user";

// Server entry on bunny.net Edge Scripting (PLATFORM=bunny, see vite.config.ts). In development it runs in Node (`npm run dev:bunny`).
//
// The build (dist/server/server.bunny.js, one file) isn't the deployed Edge Script: Edge Scripting limits the script's startup time,
// and parsing the app takes too long. scripts/bunnyBuild.ts turns it into a module in the Storage Zone and generates the Edge Script:
// a small loader that imports the app with the first request (see there).
//
// - database: libSQL, the Bunny Database in BUNNY_DATABASE_URL / BUNNY_DATABASE_AUTH_TOKEN (over HTTP: the build uses
//   @libsql/client/web), in development a SQLite file (.data/app.db). Migrations: scripts/migrate.ts, run by the deployment.
// - static files (dist/client/assets): uploaded to a Storage Zone by the deployment, served from ASSETS_URL (see serveAsset)
// - login: OpenID Connect (src/platform/oidc.server.ts); in development without OIDC_ISSUER every request is DEV_USER_EMAIL
// - APP_URL (optional): the public URL, if the script sees another one (e.g. behind a custom hostname)

let db: Database | undefined;

setPlatform({
    name: "bunny",
    getDb: () => {
        db ??= drizzle(createClient({ url: databaseUrl(), authToken: getEnv("BUNNY_DATABASE_AUTH_TOKEN") }), { casing: "snake_case" });
        return db;
    },
    getEnv,
    logoutPath: "/auth/logout",
});

// Bunny's runtime (Deno) and Node both have process.env (the app is type-checked with the Workers types, which have no `process`)
const processEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

function getEnv(name: string) {
    return processEnv[name] || undefined;
}

// the same in scripts/libsql.ts
function databaseUrl() {
    return getEnv("BUNNY_DATABASE_URL") ?? "file:.data/app.db";
}

const oidcConfig = oidcConfigFromEnv(getEnv);

export default {
    async fetch(request: Request): Promise<Response> {
        request = withPublicUrl(request);
        if (new URL(request.url).pathname.startsWith(assetsPath)) {
            return serveAsset(request);
        }
        const result = await authenticateRequest(request);
        const response = "response" in result ? result.response : await handleRequest(request, result.user);
        return withoutCaching(response);
    },
};

async function authenticateRequest(request: Request): Promise<AuthResult> {
    if (oidcConfig) {
        return authenticate(request, oidcConfig);
    }
    const devUserEmail = getEnv("DEV_USER_EMAIL");
    if (import.meta.env.DEV && devUserEmail) {
        return { user: userFromEmail(devUserEmail) };
    }
    console.error("Request denied: login not configured (OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, SESSION_SECRET)");
    return { response: new Response("Login not configured", { status: 500 }) };
}

// The build's static files (scripts, styles, fonts; names with content hash), public like on Cloudflare. An Edge Script can't contain
// them (script size limit): they are in a Storage Zone, fetched from its Pull Zone ASSETS_URL. The response is immutable, so the
// script's Pull Zone caches it and the script runs once per file and edge location. In development Vite serves them.
const assetsPath = "/assets/";

async function serveAsset(request: Request) {
    const assetsUrl = getEnv("ASSETS_URL");
    if (!assetsUrl || request.method !== "GET") {
        return new Response("Not Found", { status: 404 });
    }
    const { pathname } = new URL(request.url);
    const upstream = await fetch(new URL(pathname, assetsUrl));
    if (!upstream.ok) {
        return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
    }
    const headers = new Headers({ "cache-control": "public, max-age=31536000, immutable" });
    const contentType = upstream.headers.get("content-type");
    if (contentType) {
        headers.set("content-type", contentType);
    }
    return new Response(upstream.body, { headers });
}

// The Pull Zone in front of the script caches responses by their headers: pages, server functions, chat and MCP are per user
function withoutCaching(response: Response) {
    if (response.headers.has("cache-control")) {
        return response;
    }
    const headers = new Headers(response.headers);
    headers.set("cache-control", "private, no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// The request with the public URL (APP_URL): for the login's redirect URI, the Origin checks and Secure cookies
function withPublicUrl(request: Request) {
    const appUrl = getEnv("APP_URL");
    if (!appUrl) {
        return request;
    }
    const url = new URL(request.url);
    const publicUrl = new URL(`${url.pathname}${url.search}`, appUrl);
    return publicUrl.href === url.href ? request : new Request(publicUrl, request);
}
