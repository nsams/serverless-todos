import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { authenticate, type AuthResult, oidcConfigFromEnv } from "./platform/oidc.server";
import { type Database, setPlatform } from "./platform/platform.server";
import { handleRequest } from "./server";
import { userFromEmail } from "./user";

// Server entry on Node (PLATFORM=node, see vite.config.ts), e.g. in a container on bunny.net Magic Containers (Dockerfile):
// - database: libSQL, the Bunny Database in BUNNY_DATABASE_URL / BUNNY_DATABASE_AUTH_TOKEN (set by bunny.net when the database is
//   connected to the app), locally a SQLite file (see databaseUrl). Migrations: scripts/migrate.ts, run before the server starts.
// - login: OpenID Connect (src/platform/oidc.server.ts); in development without OIDC_ISSUER every request is DEV_USER_EMAIL
// - APP_URL: the public URL (e.g. https://todos.example.com), as the container gets the requests from bunny.net's edge over http

let db: Database | undefined;

setPlatform({
    name: "node",
    getDb: () => {
        db ??= drizzle(createClient({ url: databaseUrl(), authToken: getEnv("BUNNY_DATABASE_AUTH_TOKEN") }), { casing: "snake_case" });
        return db;
    },
    getEnv,
    logoutPath: "/auth/logout",
});

// process.env (the app is type-checked with the Workers types, which have no `process`)
const processEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

function getEnv(name: string) {
    return processEnv[name] || undefined;
}

// the same in scripts/migrate.ts
function databaseUrl() {
    return getEnv("BUNNY_DATABASE_URL") ?? "file:.data/app.db";
}

const oidcConfig = oidcConfigFromEnv(getEnv);

export default {
    async fetch(request: Request): Promise<Response> {
        request = withPublicUrl(request);
        const result = await authenticateRequest(request);
        if ("response" in result) {
            return result.response;
        }
        return handleRequest(request, result.user);
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
