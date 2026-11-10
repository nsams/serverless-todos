import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

import { aiDevProxy } from "./aiDevProxy";

// The platform the app is built for (see src/platform/platform.server.ts):
// - cloudflare (default): Cloudflare Workers, runs in the Workers runtime (workerd) also in development
// - node (PLATFORM=node): a Node server, e.g. in a container on bunny.net Magic Containers (Dockerfile)
const platform = process.env.PLATFORM === "node" ? "node" : "cloudflare";

function cloudflarePlugins(): PluginOption[] {
    return [
        // before the Cloudflare plugin, which handles all other requests
        aiDevProxy(),
        cloudflare({
            viteEnvironment: { name: "ssr" },
            config: () => ({
                // Local simulation of Cloudflare Access (sets `ctx.access` on every request), configured in .env/.env.local; not set in production builds
                ...(process.env.DEV_USER_EMAIL && process.env.ACCESS_AUD
                    ? { access: { dev: { aud: process.env.ACCESS_AUD, identity: { email: process.env.DEV_USER_EMAIL } } } }
                    : {}),
                // The Preview's own database, set by scripts/preview.ts when building a Worker Preview
                ...(process.env.PREVIEW_D1_DATABASE_NAME && process.env.PREVIEW_D1_DATABASE_ID
                    ? {
                          previews: {
                              d1_databases: [
                                  {
                                      binding: "DB",
                                      database_name: process.env.PREVIEW_D1_DATABASE_NAME,
                                      database_id: process.env.PREVIEW_D1_DATABASE_ID,
                                  },
                              ],
                          },
                      }
                    : {}),
            }),
            // No remote bindings (they'd need `wrangler login`): the app only uses D1, emulated locally
            remoteBindings: false,
        }),
    ];
}

export default defineConfig(({ command }) => ({
    plugins: [
        ...(platform === "cloudflare" ? cloudflarePlugins() : []),
        // the routes of the modules live in their module folders: tsr.config.json, src/routes.ts
        tanstackStart({
            // the server entry of the platform (relative to src/); on Cloudflare also `main` in wrangler.jsonc
            server: { entry: platform === "node" ? "server.node.ts" : "server.cloudflare.ts" },
        }),
        viteReact(),
    ],
    // Node platform: the build bundles the dependencies like for Cloudflare, except libSQL with its native bindings (the only dependency
    // the container installs, see Dockerfile). In development only the packages Node's ESM loader can't load (extensionless imports).
    ...(platform === "node" && {
        ssr: command === "build" ? { noExternal: true, external: ["@libsql/client"] } : { noExternal: [/^@dextinity\//] },
    }),
    server: {
        port: Number(process.env.APP_PORT ?? 5173),
        strictPort: true,
    },
    resolve: {
        tsconfigPaths: true,
    },
}));
