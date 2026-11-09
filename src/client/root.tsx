import { Box, CircularProgress, Container, Typography } from "@mui/material";
import { isRouteErrorResponse, Outlet, ScrollRestoration, useRouteError } from "react-router";

import { useDocumentTitle } from "~/components/useDocumentTitle";

// The root route: every page (the theme and the error snackbar are set up in main.tsx, around the router)
export function Root() {
    return (
        <>
            <ScrollRestoration />
            <Outlet />
        </>
    );
}

// While the first page's data is loading
export function HydrateFallback() {
    return (
        <Box sx={{ display: "flex", justifyContent: "center", p: 8 }}>
            <CircularProgress />
        </Box>
    );
}

// Errors outside the app layout, e.g. an unknown path or the app layout's data failed to load. Errors of the pages are shown
// in the app layout (see AppLayout.tsx).
export function RootErrorBoundary() {
    return <RouteErrorMessage />;
}

// The error of the route (thrown by its loader or while rendering); a 404 (e.g. no matching route, or the API's 404 in a loader,
// see loadResponse in src/api/client.ts) as "not found"
export function RouteErrorMessage() {
    const error = useRouteError();
    if (isRouteErrorResponse(error) && error.status === 404) {
        return <ErrorMessage message="404" details="The requested page could not be found." />;
    }
    console.error(error);
    return <ErrorMessage message="Error" details={import.meta.env.DEV && error instanceof Error ? error.message : "An unexpected error occurred."} />;
}

function ErrorMessage({ message, details }: { message: string; details: string }) {
    useDocumentTitle();
    return (
        <Container sx={{ py: 4 }}>
            <Typography variant="h4">{message}</Typography>
            <Typography>{details}</Typography>
        </Container>
    );
}
