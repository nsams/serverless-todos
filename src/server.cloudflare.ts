import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

import { getAccessUser } from "./platform/cloudflareAccess.server";
import { setPlatform } from "./platform/platform.server";
import { handleRequest } from "./server";

// Server entry on Cloudflare Workers (`main` in wrangler.jsonc): D1 as database, login via Cloudflare Access (src/platform/cloudflareAccess.server.ts)

setPlatform({
    name: "cloudflare",
    // the D1 binding is just a handle, no connection pool to manage
    getDb: () => drizzle(env.DB, { casing: "snake_case" }),
    getEnv: (name) => {
        const value = (env as unknown as Record<string, unknown>)[name];
        return typeof value === "string" && value !== "" ? value : undefined;
    },
    // handled by Cloudflare Access
    logoutPath: "/cdn-cgi/access/logout",
});

export default {
    async fetch(request, _env, ctx) {
        // `ctx.access`: set by the runtime on requests that matched an Access application
        const user = await getAccessUser(request, ctx.access);
        if (!user) {
            return new Response("Forbidden", { status: 403 });
        }
        // MCP clients authenticate with an OAuth token issued by Cloudflare Access (managed OAuth), Access verifies it and forwards
        // the request with the Access JWT like for a browser session
        return handleRequest(request, user);
    },
} satisfies ExportedHandler<Env>;
