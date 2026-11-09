import { cloudflare } from "@cloudflare/vite-plugin";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { cloudflareAiDevProxy } from "./cloudflareAiDevProxy";

// The app (index.html, src/client/main.tsx) is built as single-page application into static assets, the worker (src/server.ts: REST API,
// chat, MCP server) by the Cloudflare plugin; both are served by the dev server, the worker in the Workers runtime (workerd)
export default defineConfig({
    plugins: [
        // before the Cloudflare plugin, which handles all other requests
        cloudflareAiDevProxy(),
        cloudflare({
            // Local simulation of Cloudflare Access (sets `ctx.access` on every request), configured in .env/.env.local; not set in production builds
            config: () =>
                process.env.DEV_USER_EMAIL && process.env.ACCESS_AUD
                    ? { access: { dev: { aud: process.env.ACCESS_AUD, identity: { email: process.env.DEV_USER_EMAIL } } } }
                    : {},
            // No remote bindings (they'd need `wrangler login`): the AI binding (remote-only) isn't used in development, the chat assistant
            // calls the model through cloudflareAiDevProxy instead (see src/chat/model.server.ts)
            remoteBindings: false,
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
});
