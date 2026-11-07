import { Container, Typography } from "@mui/material";
import type { ErrorComponentProps } from "@tanstack/react-router";

// Default error and not found components of the router (src/router.tsx): rendered by the nearest route, so e.g. a list that doesn't exist keeps the app layout
export function ErrorComponent({ error }: ErrorComponentProps) {
    return <ErrorMessage message="Error" details={import.meta.env.DEV && error instanceof Error ? error.message : "An unexpected error occurred."} />;
}

export function NotFoundComponent() {
    return <ErrorMessage message="404" details="The requested page could not be found." />;
}

function ErrorMessage({ message, details }: { message: string; details: string }) {
    return (
        <Container sx={{ py: 4 }}>
            <Typography variant="h4" component="h1">
                {message}
            </Typography>
            <Typography>{details}</Typography>
        </Container>
    );
}
