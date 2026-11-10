import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { cloudflareAiDevProxy } from "./cloudflareAiDevProxy";

export default defineConfig({
    plugins: [
        // before the Cloudflare plugin, which handles all other requests
        cloudflareAiDevProxy(),
        // the worker (src/server.ts: API, chat, MCP) and the app as static assets (index.html, src/main.tsx), see wrangler.jsonc
        cloudflare({
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
            // No remote bindings (they'd need `wrangler login`): the AI binding (remote-only) isn't used in development, the chat assistant
            // calls the model through cloudflareAiDevProxy instead (see src/chat/model.server.ts)
            remoteBindings: false,
        }),
        // generates the route tree (src/routeTree.gen.ts) from the route files (config: tsr.config.json; the routes of the modules live in
        // their module folders, see src/routes.ts). Each page's component is loaded on demand (code splitting), in parallel with its loader's data.
        tanstackRouter({ target: "react", autoCodeSplitting: true }),
        viteReact(),
    ],
    server: {
        port: Number(process.env.APP_PORT ?? 5173),
        strictPort: true,
    },
    resolve: {
        tsconfigPaths: true,
    },
});
