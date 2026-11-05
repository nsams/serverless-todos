import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { type CryptoKey, exportJWK, generateKeyPair, type JWK, jwtVerify, SignJWT } from "jose";
import type { Connect, Plugin } from "vite";

// Emulates Cloudflare Access (https://developers.cloudflare.com/cloudflare-one/applications/) for local development:
// a login page to pick a user, the CF_Authorization cookie and the Cf-Access-Jwt-Assertion header, signed with a key generated on startup.
// The app verifies the JWT exactly like in production; only ACCESS_TEAM_DOMAIN points to the dev server instead of <team>.cloudflareaccess.com.
// Dev only: `configureServer`/`configurePreviewServer` aren't used in the production build.

type Options = {
    /** Users offered on the login page (any other email can be entered as well) */
    users: string[];
};

const cookieName = "CF_Authorization";
const jwtHeader = "cf-access-jwt-assertion";
const algorithm = "RS256";
const keyId = "access-emulation";
const sessionDuration = 60 * 60 * 24; // seconds

export function accessEmulation({ users }: Options): Plugin {
    let middleware: Connect.NextHandleFunction | undefined;
    const getMiddleware = () => (middleware ??= createMiddleware(users));
    return {
        name: "access-emulation",
        // added directly (not as post hook) so it runs before the Cloudflare plugin passes requests to the worker
        enforce: "pre",
        configureServer(server) {
            server.middlewares.use(getMiddleware());
        },
        configurePreviewServer(server) {
            server.middlewares.use(getMiddleware());
        },
    };
}

function createMiddleware(users: string[]): Connect.NextHandleFunction {
    const teamDomain = requireEnv("ACCESS_TEAM_DOMAIN");
    const aud = requireEnv("ACCESS_AUD");
    const keys = generateKeys();

    async function handle(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
        // like Access: never pass on a client-supplied header
        delete req.headers[jwtHeader];
        const url = new URL(req.url ?? "/", "http://localhost");

        switch (url.pathname) {
            case "/cdn-cgi/access/certs":
                return sendJson(res, { keys: [(await keys).publicJwk] });

            case "/cdn-cgi/access/login": {
                const redirectUrl = sanitizeRedirectUrl(url.searchParams.get("redirect_url"));
                if (req.method === "POST") {
                    const email = new URLSearchParams(await readBody(req)).get("email")?.trim().toLowerCase();
                    if (email) {
                        const token = await signToken(email, teamDomain, aud, (await keys).privateKey);
                        res.setHeader("Set-Cookie", `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionDuration}`);
                        return sendRedirect(res, redirectUrl);
                    }
                }
                return sendHtml(res, loginPage(users, redirectUrl));
            }

            case "/cdn-cgi/access/logout":
                res.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
                return sendRedirect(res, "/cdn-cgi/access/login");
        }

        const token = getCookie(req, cookieName);
        if (token && (await isValidToken(token, teamDomain, aud, (await keys).publicKey))) {
            req.headers[jwtHeader] = token;
            return next();
        }
        if (req.method === "GET" && req.headers.accept?.includes("text/html")) {
            return sendRedirect(res, `/cdn-cgi/access/login?redirect_url=${encodeURIComponent(url.pathname + url.search)}`);
        }
        res.statusCode = 401;
        res.end("Unauthorized");
    }

    return (req, res, next) => {
        handle(req, res, next).catch(next);
    };
}

async function generateKeys() {
    const { publicKey, privateKey } = await generateKeyPair(algorithm, { extractable: true });
    const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid: keyId, alg: algorithm, use: "sig" };
    return { publicKey, privateKey, publicJwk };
}

function signToken(email: string, teamDomain: string, aud: string, privateKey: CryptoKey) {
    // same claims as a Cloudflare Access application token (sub is a stable per-user UUID there)
    const hash = createHash("sha256").update(email).digest("hex");
    const sub = [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join("-");
    return new SignJWT({ email, type: "app" })
        .setProtectedHeader({ alg: algorithm, kid: keyId })
        .setIssuer(teamDomain)
        .setAudience([aud])
        .setSubject(sub)
        .setIssuedAt()
        .setNotBefore("0s")
        .setExpirationTime(`${sessionDuration}s`)
        .sign(privateKey);
}

async function isValidToken(token: string, teamDomain: string, aud: string, publicKey: CryptoKey) {
    try {
        await jwtVerify(token, publicKey, { issuer: teamDomain, audience: aud });
        return true;
    } catch {
        // expired, or signed with the key of a previous dev server run
        return false;
    }
}

function loginPage(users: string[], redirectUrl: string) {
    const action = `/cdn-cgi/access/login?redirect_url=${encodeURIComponent(redirectUrl)}`;
    const userButtons = users
        .map((email) => `<button type="submit" name="email" value="${escapeHtml(email)}">${escapeHtml(email)}</button>`)
        .join("\n");
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in (Cloudflare Access emulation)</title>
<style>
    body { font-family: system-ui, sans-serif; background: #f4f4f4; display: flex; justify-content: center; padding: 64px 16px; margin: 0; }
    main { background: #fff; border-radius: 8px; padding: 32px; width: 100%; max-width: 360px; box-shadow: 0 1px 4px rgb(0 0 0 / 15%); }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p { color: #666; font-size: 14px; margin: 0 0 24px; }
    form { display: flex; flex-direction: column; gap: 8px; }
    button, input { font: inherit; padding: 10px 12px; border-radius: 4px; border: 1px solid #ccc; }
    button { background: #fff; cursor: pointer; text-align: left; }
    button:hover { border-color: #f38020; }
    hr { width: 100%; border: none; border-top: 1px solid #eee; margin: 8px 0; }
</style>
</head>
<body>
<main>
    <h1>Sign in</h1>
    <p>Local emulation of Cloudflare Access</p>
    <form method="post" action="${escapeHtml(action)}">
        ${userButtons}
    </form>
    <hr>
    <form method="post" action="${escapeHtml(action)}">
        <input type="email" name="email" placeholder="Other email" required>
        <button type="submit">Sign in</button>
    </form>
</main>
</body>
</html>`;
}

function requireEnv(name: string) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not set (see .env)`);
    }
    return value;
}

// only allow same-origin paths
function sanitizeRedirectUrl(value: string | null) {
    return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function getCookie(req: IncomingMessage, name: string) {
    for (const part of req.headers.cookie?.split(";") ?? []) {
        const [key, ...value] = part.trim().split("=");
        if (key === name) {
            return value.join("=");
        }
    }
    return undefined;
}

async function readBody(req: IncomingMessage) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString();
}

function escapeHtml(value: string) {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function sendJson(res: ServerResponse, body: unknown) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, body: string) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(body);
}

function sendRedirect(res: ServerResponse, location: string) {
    res.statusCode = 302;
    res.setHeader("Location", location);
    res.end();
}
