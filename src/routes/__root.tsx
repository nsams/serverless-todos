import robotoFlexCss from "@fontsource-variable/roboto-flex?url";
import { Container, CssBaseline, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { createRootRoute, type ErrorComponentProps, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ErrorSnackbarProvider } from "~/components/ErrorSnackbar";
import { theme } from "~/theme";

export const Route = createRootRoute({
    head: () => ({
        meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "Todos" }],
        links: [{ rel: "stylesheet", href: robotoFlexCss }],
    }),
    shellComponent: RootDocument,
    errorComponent: ErrorComponent,
    notFoundComponent: () => <ErrorMessage message="404" details="The requested page could not be found." />,
});

function RootDocument({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body>
                <ThemeProvider theme={theme}>
                    <CssBaseline />
                    <ErrorSnackbarProvider>{children}</ErrorSnackbarProvider>
                </ThemeProvider>
                <Scripts />
            </body>
        </html>
    );
}

function ErrorComponent({ error }: ErrorComponentProps) {
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
