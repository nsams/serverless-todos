import { createServerFn } from "@tanstack/react-start";

import { isChatEnabled } from "./chat/model.server";
import { getPlatform } from "./platform/platform.server";

// The authenticated user (src/start.ts) and what the app shell needs to know about the platform
export const getAppSession = createServerFn().handler(async ({ context: { user } }) => {
    return {
        user,
        // where the logout button leads (Cloudflare Access or the app's own login, src/platform/)
        logoutPath: getPlatform().logoutPath,
        // without an API key for the model there is no chat assistant (src/chat/model.server.ts)
        chatEnabled: isChatEnabled(),
    };
});
