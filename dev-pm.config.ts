import { defineConfig } from "dev-process-manager";

export default defineConfig({
    scripts: [
        {
            name: "oidc-provider",
            script: "pnpm run dev:oidc-provider",
            group: ["dev", "dev-postgres"],
        },
        {
            name: "app",
            script: "pnpm run dev:app",
            group: ["dev"],
            waitOn: ["tcp:$IDP_PORT"],
        },
        {
            name: "docker",
            // Export the env files so Docker Compose binds the ports from `.env.local`.
            script: "set -a; . ./.env; [ ! -f .env.local ] || . ./.env.local; set +a; docker compose up",
            group: ["dev-postgres"],
        },
        {
            name: "app-postgres",
            script: "pnpm run db:migrate:pg && pnpm run dev:app:postgres",
            group: ["dev-postgres"],
            waitOn: ["tcp:$IDP_PORT", "tcp:$POSTGRESQL_PORT"],
        },
    ],
});
