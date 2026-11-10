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
            // Node platform (local libSQL file, see src/server.node.ts)
            name: "app-node",
            script: "npm run db:migrate:node && npm run dev:node:app",
            group: ["dev-node"],
        },
    ],
});
