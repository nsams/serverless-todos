import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { accessEmulation } from "./vite-plugin-access-emulation";

export default defineConfig({
    plugins: [
        // dev only: emulates Cloudflare Access, which handles the login in production
        accessEmulation({ users: ["admin@example.com", "user@example.com"] }),
        cloudflare({ viteEnvironment: { name: "ssr" } }),
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
