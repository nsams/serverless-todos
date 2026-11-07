import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [
        cloudflare({
            viteEnvironment: { name: "ssr" },
            // Local simulation of Cloudflare Access (sets `ctx.access` on every request), configured in .env/.env.local; not set in production builds
            config: () =>
                process.env.DEV_USER_EMAIL && process.env.ACCESS_AUD
                    ? { access: { dev: { aud: process.env.ACCESS_AUD, identity: { email: process.env.DEV_USER_EMAIL } } } }
                    : {},
            // The AI binding (chat assistant) always runs remotely, which needs a Cloudflare login (`npx wrangler login`).
            // REMOTE_BINDINGS=false (.env.local) runs the app without one; the assistant then answers with an error.
            remoteBindings: process.env.REMOTE_BINDINGS !== "false",
        }),
        tanstackStart(),
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
