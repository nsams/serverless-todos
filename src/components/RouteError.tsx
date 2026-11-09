import { Container, Typography } from "@mui/material";
import type { ErrorComponentProps } from "@tanstack/react-router";

// The pages of the router for 404 (unknown path, or e.g. a list that doesn't exist (anymore), see loadOrNotFound in src/routing.ts)
// and unexpected errors (src/router.tsx); shown in place of the route's page, so within the app layout

export function RouteNotFound() {
    return <ErrorMessage message="404" details="The requested page could not be found." />;
}

export function RouteError({ error }: ErrorComponentProps) {
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
