import { Container, Typography } from "@mui/material";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { useDocumentTitle } from "~/components/useDocumentTitle";

// An error of a route (thrown by its loader or while rendering), shown in place of the route's component (see router.tsx)
export function PageErrorMessage({ error }: ErrorComponentProps) {
    console.error(error);
    return <ErrorMessage message="Error" details={import.meta.env.DEV && error instanceof Error ? error.message : "An unexpected error occurred."} />;
}

// "Not found": an unknown path, or the API's 404 in a loader (loadResponse in src/api/client.ts throws notFound()). A notFound() thrown
// by a loader is only shown by a route that has a notFoundComponent (otherwise by the root route, without the app layout), so the pages
// whose loaders can throw it set notFoundComponent: PageNotFound.
export function PageNotFound() {
    return <ErrorMessage message="404" details="The requested page could not be found." />;
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
