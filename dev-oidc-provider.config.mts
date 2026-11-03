import { defineConfig } from "dev-oidc-provider";

export default defineConfig({
    port: process.env.IDP_PORT ? Number(process.env.IDP_PORT) : 8080,
    listUsers: () => [
        { id: "1", name: "Admin", email: "admin@example.com" },
        { id: "2", name: "User", email: "user@example.com" },
    ],
    client: {
        client_id: process.env.OIDC_CLIENT_ID,
        client_secret: process.env.OIDC_CLIENT_SECRET,
        redirect_uris: [`${process.env.APP_URL}/auth/callback`],
        post_logout_redirect_uris: [`${process.env.APP_URL}/`],
    },
});
