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
            // Local simulation of Cloudflare Access (sets `ctx.access` on every request), configured in .env/.env.local; not set in production builds
            config: () =>
                process.env.DEV_USER_EMAIL && process.env.ACCESS_AUD
                    ? { access: { dev: { aud: process.env.ACCESS_AUD, identity: { email: process.env.DEV_USER_EMAIL } } } }
                    : {},
            // No remote bindings (they'd need `wrangler login`): the AI binding (remote-only) isn't used in development, the chat assistant
            // calls the model through cloudflareAiDevProxy instead (see src/chat/model.server.ts)
            remoteBindings: false,
        }),
        // React Router framework mode (react-router.config.ts, routes in src/routes.ts); includes React Fast Refresh
        reactRouter(),
    ],
    server: {
        port: Number(process.env.APP_PORT ?? 5173),
        strictPort: true,
    },
    resolve: {
        tsconfigPaths: true,
    },
});
