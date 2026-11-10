import { createRemoteJWKSet, type JWTPayload, jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { mcpPath } from "~/mcp/mcp";
import { type User, userFromEmail } from "~/user";

// bunny.net platform (src/server.bunny.ts): login with OpenID Connect, e.g. Microsoft Entra ID, without a service in front of the app.
//
// - Browser: authorization code flow with PKCE (/auth/login → identity provider → /auth/callback), then a session cookie (a JWT signed
//   with SESSION_SECRET) with the user's email. Pages without a session redirect to the login, other requests get 401.
// - MCP clients (/mcp): an OAuth access token of the same identity provider as Bearer token (the app is a resource server, RFC 9728:
//   the 401 points to the Protected Resource Metadata, which names the identity provider as authorization server). Only when
//   MCP_OAUTH_AUDIENCE is set.
//
// Env: OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, SESSION_SECRET (at least 32 characters); optional MCP_OAUTH_AUDIENCE, MCP_OAUTH_SCOPE

export type OidcConfig = {
    issuer: string;
    clientId: string;
    clientSecret: string;
    sessionKey: Uint8Array;
    mcp: { audience: string; scope: string | undefined } | undefined;
};

export function oidcConfigFromEnv(getEnv: (name: string) => string | undefined): OidcConfig | undefined {
    const issuer = getEnv("OIDC_ISSUER");
    const clientId = getEnv("OIDC_CLIENT_ID");
    const clientSecret = getEnv("OIDC_CLIENT_SECRET");
    const sessionSecret = getEnv("SESSION_SECRET");
    if (!issuer || !clientId || !clientSecret || !sessionSecret) {
        return undefined;
    }
    if (sessionSecret.length < 32) {
        throw new Error("SESSION_SECRET must have at least 32 characters");
    }
    const mcpAudience = getEnv("MCP_OAUTH_AUDIENCE");
    return {
        issuer,
        clientId,
        clientSecret,
        sessionKey: new TextEncoder().encode(sessionSecret),
        mcp: mcpAudience ? { audience: mcpAudience, scope: getEnv("MCP_OAUTH_SCOPE") } : undefined,
    };
}

export const authPaths = { login: "/auth/login", callback: "/auth/callback", logout: "/auth/logout" };

const sessionCookie = "session";
const sessionMaxAgeSeconds = 24 * 60 * 60;
// state, nonce and PKCE verifier between /auth/login and /auth/callback
const flowCookie = "auth_flow";
const flowMaxAgeSeconds = 10 * 60;

const protectedResourceMetadataPath = "/.well-known/oauth-protected-resource";

// The result of authenticating a request: the user, or the response to send instead (redirect to the login, 401, the login's own pages)
export type AuthResult = { user: User } | { response: Response };

export async function authenticate(request: Request, config: OidcConfig): Promise<AuthResult> {
    const url = new URL(request.url);
    switch (url.pathname) {
        case authPaths.login:
            return { response: await login(request, config) };
        case authPaths.callback:
            return { response: await callback(request, config) };
        case authPaths.logout:
            return { response: await logout(request, config) };
    }
    if (url.pathname === mcpPath || url.pathname.startsWith(protectedResourceMetadataPath)) {
        return authenticateMcp(request, config);
    }

    const user = await getSessionUser(request, config);
    if (user) {
        return { user };
    }
    if (request.method === "GET" && request.headers.get("sec-fetch-mode") === "navigate") {
        const returnTo = `${url.pathname}${url.search}`;
        return { response: redirect(`${authPaths.login}?${new URLSearchParams({ returnTo })}`) };
    }
    return { response: new Response("Unauthorized", { status: 401 }) };
}

// The identity provider's endpoints (OpenID Connect Discovery), loaded once
const discoverySchema = z.object({
    issuer: z.string(),
    authorization_endpoint: z.string(),
    token_endpoint: z.string(),
    jwks_uri: z.string(),
    end_session_endpoint: z.string().optional(),
});

let discovery: Promise<z.infer<typeof discoverySchema> & { jwks: ReturnType<typeof createRemoteJWKSet> }> | undefined;

function getDiscovery(config: OidcConfig) {
    discovery ??= (async () => {
        const response = await fetch(new URL(`${config.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`));
        if (!response.ok) {
            throw new Error(`OpenID Connect Discovery of ${config.issuer} failed: ${response.status}`);
        }
        const metadata = discoverySchema.parse(await response.json());
        return { ...metadata, jwks: createRemoteJWKSet(new URL(metadata.jwks_uri)) };
    })().catch((error: unknown) => {
        // retried with the next request
        discovery = undefined;
        throw error;
    });
    return discovery;
}

async function login(request: Request, config: OidcConfig) {
    const url = new URL(request.url);
    const { authorization_endpoint } = await getDiscovery(config);
    const state = randomString();
    const nonce = randomString();
    const codeVerifier = randomString();
    const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
    const flow = await sign({ state, nonce, codeVerifier, returnTo }, config, flowMaxAgeSeconds);

    const authorizationUrl = new URL(authorization_endpoint);
    authorizationUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: new URL(authPaths.callback, url).href,
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: await sha256Base64Url(codeVerifier),
        code_challenge_method: "S256",
    }).toString();
    return redirect(authorizationUrl.href, [cookie(request, flowCookie, flow, flowMaxAgeSeconds)]);
}

const flowSchema = z.object({ state: z.string(), nonce: z.string(), codeVerifier: z.string(), returnTo: z.string() });

async function callback(request: Request, config: OidcConfig) {
    const url = new URL(request.url);
    const flow = flowSchema.safeParse(await verify(readCookie(request, flowCookie), config));
    const code = url.searchParams.get("code");
    if (!flow.success || !code || url.searchParams.get("state") !== flow.data.state) {
        // e.g. the login page was open longer than flowMaxAgeSeconds, or the identity provider reported an error
        console.warn("Login failed: invalid state", url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "");
        return new Response("Login failed, please try again.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    const { token_endpoint, issuer, jwks } = await getDiscovery(config);
    const tokenResponse = await fetch(token_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: new URL(authPaths.callback, url).href,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code_verifier: flow.data.codeVerifier,
        }),
    });
    const tokens = z.object({ id_token: z.string() }).safeParse(await tokenResponse.json().catch(() => undefined));
    if (!tokenResponse.ok || !tokens.success) {
        console.warn(`Login failed: token request ${tokenResponse.status}`);
        return new Response("Login failed.", { status: 502 });
    }
    const { payload } = await jwtVerify(tokens.data.id_token, jwks, { issuer, audience: config.clientId });
    const email = emailOf(payload);
    if (payload.nonce !== flow.data.nonce || !email) {
        console.warn(`Login failed: ${email ? "nonce mismatch" : "ID token without email"}`);
        return new Response("Login failed.", { status: 403 });
    }

    const session = await sign({ email }, config, sessionMaxAgeSeconds);
    return redirect(flow.data.returnTo, [cookie(request, sessionCookie, session, sessionMaxAgeSeconds), cookie(request, flowCookie, "", 0)]);
}

async function logout(request: Request, config: OidcConfig) {
    const { end_session_endpoint } = await getDiscovery(config);
    let location = "/";
    if (end_session_endpoint) {
        const endSessionUrl = new URL(end_session_endpoint);
        endSessionUrl.searchParams.set("client_id", config.clientId);
        endSessionUrl.searchParams.set("post_logout_redirect_uri", new URL("/", request.url).href);
        location = endSessionUrl.href;
    }
    return redirect(location, [cookie(request, sessionCookie, "", 0)]);
}

async function getSessionUser(request: Request, config: OidcConfig) {
    const session = z.object({ email: z.string() }).safeParse(await verify(readCookie(request, sessionCookie), config));
    return session.success ? userFromEmail(session.data.email) : undefined;
}

// MCP clients: Bearer token of the identity provider, its audience MCP_OAUTH_AUDIENCE (e.g. the Application ID URI of the app registration)
async function authenticateMcp(request: Request, config: OidcConfig): Promise<AuthResult> {
    const url = new URL(request.url);
    if (!config.mcp) {
        return { response: new Response("Not Found", { status: 404 }) };
    }
    const resourceMetadataUrl = new URL(`${protectedResourceMetadataPath}${mcpPath}`, url).href;
    if (url.pathname.startsWith(protectedResourceMetadataPath)) {
        const metadata = {
            resource: new URL(mcpPath, url).href,
            authorization_servers: [(await getDiscovery(config)).issuer],
            scopes_supported: config.mcp.scope ? [config.mcp.scope] : undefined,
            bearer_methods_supported: ["header"],
        };
        return { response: Response.json(metadata, { headers: { "access-control-allow-origin": "*" } }) };
    }
    const challenge = (error?: string) =>
        new Response("Unauthorized", {
            status: 401,
            headers: { "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"${error ? `, error="${error}"` : ""}` },
        });
    const token = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token) {
        return { response: challenge() };
    }
    try {
        const { issuer, jwks } = await getDiscovery(config);
        const { payload } = await jwtVerify(token, jwks, { issuer, audience: config.mcp.audience });
        const email = emailOf(payload);
        if (!email) {
            console.warn("MCP request denied: access token without email");
            return { response: challenge("invalid_token") };
        }
        return { user: userFromEmail(email) };
    } catch (error) {
        console.warn("MCP request denied: invalid access token", error);
        return { response: challenge("invalid_token") };
    }
}

// Entra ID: `email` only with the optional claim, `preferred_username` (the UPN, usually the email) always; `upn` in v1 access tokens
function emailOf(payload: JWTPayload) {
    for (const claim of ["email", "preferred_username", "upn"]) {
        const value = payload[claim];
        if (typeof value === "string" && value.includes("@")) {
            return value;
        }
    }
    return undefined;
}

// Only paths of this app (no open redirect)
function safeReturnTo(returnTo: string | null) {
    return returnTo?.startsWith("/") && !returnTo.startsWith("//") && !returnTo.startsWith("/\\") ? returnTo : "/";
}

async function sign(payload: JWTPayload, config: OidcConfig, maxAgeSeconds: number) {
    return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${maxAgeSeconds}s`).sign(config.sessionKey);
}

async function verify(token: string | undefined, config: OidcConfig) {
    if (!token) {
        return undefined;
    }
    try {
        return (await jwtVerify(token, config.sessionKey, { algorithms: ["HS256"] })).payload;
    } catch {
        return undefined;
    }
}

function readCookie(request: Request, name: string) {
    for (const part of (request.headers.get("cookie") ?? "").split(";")) {
        const [key, ...value] = part.trim().split("=");
        if (key === name) {
            return value.join("=");
        }
    }
    return undefined;
}

function cookie(request: Request, name: string, value: string, maxAgeSeconds: number) {
    // Secure except on http://localhost in development
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function redirect(location: string, cookies: string[] = []) {
    const headers = new Headers({ location });
    for (const value of cookies) {
        headers.append("set-cookie", value);
    }
    return new Response(null, { status: 302, headers });
}

function randomString() {
    return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256Base64Url(value: string) {
    return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function base64Url(bytes: Uint8Array) {
    return btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
}
