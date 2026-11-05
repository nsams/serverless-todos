import { env } from "cloudflare:workers";

// Authentication is done by Cloudflare Access in front of the worker; the runtime sets `ctx.access` on requests that matched an Access application
// (locally simulated via `access.dev`, see vite.config.ts). Requests that bypassed Access (or matched another Access application) are rejected.
// See https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/

export type User = { id: string; email: string };

export async function getUser(access: CloudflareAccessContext | undefined): Promise<User | undefined> {
    if (!access) {
        console.warn("Access denied: request not authenticated by Cloudflare Access (no ctx.access)");
        return undefined;
    }
    if (access.aud !== env.ACCESS_AUD) {
        // the AUD tag is not secret (it's part of every Access JWT)
        console.warn(`Access denied: Access application AUD ${access.aud} doesn't match ACCESS_AUD ${env.ACCESS_AUD}`);
        return undefined;
    }
    const identity = await access.getIdentity();
    const email = identity?.email?.toLowerCase();
    if (!email) {
        console.warn(
            `Access denied: Access identity without email (identity ${identity ? `fields: ${Object.keys(identity).join(", ")}` : "missing"})`,
        );
        return undefined;
    }
    return { id: email, email };
}
