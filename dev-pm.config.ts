import { defineConfig } from "dev-process-manager";

export default defineConfig({
    scripts: [
        {
            name: "oidc-provider",
            script: "npm run dev:oidc-provider",
            group: ["dev"],
        },
        {
            name: "app",
            script: "npm run db:migrate && npm run dev:app",
            group: ["dev"],
            waitOn: ["tcp:$IDP_PORT"],
        },
    ],
});
