import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

import { cloudflareAiDevProxy } from "./cloudflareAiDevProxy.ts";

export default defineConfig({
    plugins: [
        // before the Cloudflare plugin, which handles all other requests
        cloudflareAiDevProxy(),
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
            // No remote bindings (they'd need `wrangler login`): the AI binding (remote-only) isn't used in development, the chat assistant
            // calls the model through cloudflareAiDevProxy instead (see src/chat/model.server.ts)
            remoteBindings: false,
        }),
        // React Router framework mode (react-router.config.ts, routes in src/routes.ts); includes React Fast Refresh
        reactRouter(),
    ],
    // The browser's dependencies, optimized when the dev server starts: Vite would discover most of them only on the first visit of a page
    // (or the first opening of the chat) and reload the page then
    optimizeDeps: {
        include: [
            "@dextinity/admin-icons",
            "@mui/material",
            "@mui/material/styles",
            "@mui/x-data-grid-pro",
            "zod",
            "markdown-to-jsx/react",
            "@cloudflare/ai-chat/react",
            "@mui/x-chat",
            "agents/react",
            "ai",
        ],
    },
    server: {
        port: Number(process.env.APP_PORT ?? 5173),
        strictPort: true,
    },
    resolve: {
        tsconfigPaths: true,
    },
});
