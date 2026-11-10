import { createRootRouteWithContext, HeadContent, Outlet } from "@tanstack/react-router";

import { pageHead } from "~/app";
import { ChatPageProvider } from "~/chat/useChatPage";
import type { RouterContext } from "~/router";

// Root route of the app (src/routes.ts); the providers (theme, error snackbar, query client) are set up in src/main.tsx
export const Route = createRootRouteWithContext<RouterContext>()({
    head: () => pageHead(undefined),
    component: Root,
});

function Root() {
    return (
        <>
            {/* the head tags of the current routes (the page title); React moves them into the document's head */}
            <HeadContent />
            {/* the pages report what they show to the chat panel (useChatPage) */}
            <ChatPageProvider>
                <Outlet />
            </ChatPageProvider>
        </>
    );
}
