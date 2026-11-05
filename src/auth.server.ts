import { env } from "cloudflare:workers";

// Authentication is done by Cloudflare Access in front of the worker; the runtime sets `ctx.access` on requests that matched an Access application
// (locally simulated via `access.dev`, see vite.config.ts). Requests that bypassed Access (or matched another Access application) are rejected.
// See https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/

export type User = { id: string; email: string };

export async function getUser(access: CloudflareAccessContext | undefined): Promise<User | undefined> {
    if (!access || access.aud !== env.ACCESS_AUD) {
        return undefined;
    }
    const email = (await access.getIdentity())?.email?.toLowerCase();
    if (!email) {
        return undefined;
    }
    return { id: email, email };
}
