import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, mergeConfig, type PluginOption, type UserConfig } from "vite";

import { aiDevProxy } from "./aiDevProxy";

// The platform the app is built for (see src/platform/platform.server.ts):
// - cloudflare (default): Cloudflare Workers, runs in the Workers runtime (workerd) also in development
// - bunny (PLATFORM=bunny): bunny.net Edge Scripting, the build is one script file (dist/server/server.bunny.js); in development Node
const platform = process.env.PLATFORM === "bunny" ? "bunny" : "cloudflare";

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

// bunny.net: the app is one module (scripts/bunnyBuild.ts loads it from the Storage Zone): all dependencies bundled, no chunks (dynamic
// imports inlined), minified.
// libSQL over HTTP: its web client (the default one has native bindings).
const bunnyBuild = {
    ssr: { noExternal: true },
    resolve: { alias: { "@libsql/client": "@libsql/client/web" } },
    environments: { ssr: { build: { minify: true, rolldownOptions: { output: { codeSplitting: false } } } } },
} satisfies UserConfig;

// bunny.net in development: Node, only the packages Node's ESM loader can't load are bundled (extensionless imports)
const bunnyDev = { ssr: { noExternal: [/^@dextinity\//] } } satisfies UserConfig;

export default defineConfig(({ command }) =>
    mergeConfig(platform === "bunny" ? (command === "build" ? bunnyBuild : bunnyDev) : {}, {
        plugins: [
            ...(platform === "cloudflare" ? cloudflarePlugins() : []),
            // the routes of the modules live in their module folders: tsr.config.json, src/routes.ts
            tanstackStart({
                // the server entry of the platform (relative to src/); on Cloudflare also `main` in wrangler.jsonc
                server: { entry: platform === "bunny" ? "server.bunny.ts" : "server.cloudflare.ts" },
                // bunny.net: the app's pages are rendered in the browser only (ssr: "data-only", src/routes/_app.tsx), so the app module needn't
                // contain their components (smaller, faster to load). Only applies to the server build (the client keeps them).
                ...(platform === "bunny" && {
                    router: { codeSplittingOptions: { deleteNodes: ["component", "errorComponent", "notFoundComponent"] } },
                }),
            }),
            viteReact(),
        ],
        server: {
            port: Number(process.env.APP_PORT ?? 5173),
            strictPort: true,
        },
        resolve: {
            tsconfigPaths: true,
        },
    }),
);
