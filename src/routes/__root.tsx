import robotoFlexCss from "@fontsource-variable/roboto-flex?url";
import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ErrorSnackbarProvider } from "~/components/ErrorSnackbar";
import { theme } from "~/theme";

export const Route = createRootRoute({
    head: () => ({
        meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "Todos" }],
        links: [{ rel: "stylesheet", href: robotoFlexCss }],
    }),
    // HTML responses only: the app must not be embedded by other sites (clickjacking)
    headers: () => ({ "Content-Security-Policy": "frame-ancestors 'none'", "X-Frame-Options": "DENY" }),
    shellComponent: RootDocument,
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
