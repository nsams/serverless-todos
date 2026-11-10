import { defineConfig } from "dev-process-manager";

export default defineConfig({
    scripts: [
        {
            // Cloudflare platform (workerd, local D1)
            name: "app",
            script: "npm run db:migrate && npm run dev:app",
            group: ["dev"],
        },
        {
            // bunny.net platform, in Node (local libSQL file, see src/server.bunny.ts)
            name: "app-bunny",
            script: "npm run db:migrate:bunny && npm run dev:bunny:app",
            group: ["dev-bunny"],
        },
    ],
});
