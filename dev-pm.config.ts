import { defineConfig } from "dev-process-manager";

export default defineConfig({
    scripts: [
        {
            name: "app",
            script: "npm run db:migrate && npm run dev:app",
            group: ["dev"],
        },
    ],
});
