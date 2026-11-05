import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Authentication is done by Cloudflare Access in front of the worker (locally emulated by `vite-plugin-access-emulation.ts`).
// Access adds a signed JWT to every request it lets through; it is verified here so the app can't be reached by bypassing Access
// (e.g. via a workers.dev or preview URL).
// See https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

export type User = { id: string; email: string };

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks() {
    jwks ??= createRemoteJWKSet(new URL("/cdn-cgi/access/certs", env.ACCESS_TEAM_DOMAIN));
    return jwks;
}

export async function getUserFromAccessJwt(request: Request): Promise<User | undefined> {
    const token = request.headers.get("cf-access-jwt-assertion");
    if (!token) {
        return undefined;
    }
    try {
        const { payload } = await jwtVerify(token, getJwks(), { issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD });
        if (typeof payload.email !== "string" || !payload.email) {
            return undefined;
        }
        const email = payload.email.toLowerCase();
        return { id: email, email };
    } catch (error) {
        console.warn("Invalid Cloudflare Access JWT", error);
        return undefined;
    }
}
