import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { type User, userFromEmail } from "~/user";

// Cloudflare platform (src/server.cloudflare.ts): authentication is done by Cloudflare Access in front of the worker. Requests that bypassed Access (or matched another Access application) are rejected.
//
// - `ctx.access` (set by the runtime) is used when available: locally (simulated via `access.dev`, see vite.config.ts).
// - In production it is NOT available: workers with static assets (added by the Cloudflare Vite plugin) run behind an internal router worker
//   that doesn't pass `ctx.access` on (https://developers.cloudflare.com/workers/configuration/cloudflare-access/#ctxaccess-limitations).
//   Instead the Access JWT in the `Cf-Access-Jwt-Assertion` header is verified
//   (https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

export async function getAccessUser(request: Request, access: CloudflareAccessContext | undefined): Promise<User | undefined> {
    const email = access ? await getEmailFromAccessContext(access) : await getEmailFromAccessJwt(request);
    if (!email) {
        return undefined;
    }
    return userFromEmail(email);
}

async function getEmailFromAccessContext(access: CloudflareAccessContext) {
    if (access.aud !== env.ACCESS_AUD) {
        // the AUD tag is not secret (it's part of every Access JWT)
        console.warn(`Access denied: Access application AUD ${access.aud} doesn't match ACCESS_AUD ${env.ACCESS_AUD}`);
        return undefined;
    }
    const identity = await access.getIdentity();
    if (!identity?.email) {
        console.warn(`Access denied: Access identity without email (${identity ? `fields: ${Object.keys(identity).join(", ")}` : "no identity"})`);
        return undefined;
    }
    return identity.email;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

async function getEmailFromAccessJwt(request: Request) {
    const token = request.headers.get("cf-access-jwt-assertion");
    if (!token) {
        console.warn("Access denied: request not authenticated by Cloudflare Access (no ctx.access, no Cf-Access-Jwt-Assertion header)");
        return undefined;
    }
    try {
        jwks ??= createRemoteJWKSet(new URL("/cdn-cgi/access/certs", env.ACCESS_TEAM_DOMAIN));
        const { payload } = await jwtVerify(token, jwks, { issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD });
        if (typeof payload.email !== "string" || !payload.email) {
            console.warn("Access denied: Access JWT without email");
            return undefined;
        }
        return payload.email;
    } catch (error) {
        console.warn("Access denied: invalid Access JWT", error);
        return undefined;
    }
}
