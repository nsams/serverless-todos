import { Box, CircularProgress, Container, Typography } from "@mui/material";
import { isRouteErrorResponse, Outlet, ScrollRestoration, useRouteError } from "react-router";

import { ChatPageProvider } from "~/chat/useChatPage";
import { usePageTitle } from "~/routing";

// Root route of the app (src/router.tsx); the providers (theme, error snackbar) are set up in src/main.tsx
export function Root() {
    return (
        // the pages report what they show (useChatPage), the chat panel in the app layout sends it with every message
        <ChatPageProvider>
            <Outlet />
            <ScrollRestoration />
        </ChatPageProvider>
    );
}

// The page of a route whose loader always redirects or throws (e.g. the start page), so React Router doesn't warn about a route without content
export function NoContent() {
    return null;
}

// Shown while the first page's data is loading
export function InitialLoading() {
    return (
        <Box sx={{ display: "flex", justifyContent: "center", p: 8 }}>
            <CircularProgress />
        </Box>
    );
}

// Error boundary of the routes: 404 (unknown path, or e.g. a list that doesn't exist (anymore)) and unexpected errors
export function RouteError() {
    const error = useRouteError();
    usePageTitle();
    if (isRouteErrorResponse(error) && error.status === 404) {
        return <ErrorMessage message="404" details="The requested page could not be found." />;
    }
    console.error(error);
    return <ErrorMessage message="Error" details={import.meta.env.DEV && error instanceof Error ? error.message : "An unexpected error occurred."} />;
}

function ErrorMessage({ message, details }: { message: string; details: string }) {
    return (
        <Container sx={{ py: 4 }}>
            <Typography variant="h4">{message}</Typography>
            <Typography>{details}</Typography>
        </Container>
    );
}
