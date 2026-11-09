import { createServerFn } from "@tanstack/react-start";

// The authenticated user (src/start.ts)
export const getCurrentUser = createServerFn().handler(async ({ context: { user } }) => {
    return user;
});
