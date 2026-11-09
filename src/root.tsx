import robotoFlexCss from "@fontsource-variable/roboto-flex?url";
import { Container, CssBaseline, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import type { ReactNode } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import type { Route } from "./+types/root";
import { appName } from "./app";
import { getUser } from "./auth.server";
import { ErrorSnackbarProvider } from "./components/ErrorSnackbar";
import { accessContext, userContext } from "./context";
import { theme } from "./theme";

// Every request of the app (pages, loaders and actions) must have been authenticated by Cloudflare Access; the user is passed on as context
const authMiddleware: Route.MiddlewareFunction = async ({ request, context }) => {
    const user = await getUser(request, context.get(accessContext));
    if (!user) {
        return new Response("Forbidden", { status: 403 });
    }
    context.set(userContext, user);
};

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export const meta: Route.MetaFunction = () => [{ title: appName }];

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: robotoFlexCss }];

// The HTML document, also around the error boundary
export function Layout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <Meta />
                <Links />
            </head>
            <body>
                <ThemeProvider theme={theme}>
                    <CssBaseline />
                    <ErrorSnackbarProvider>{children}</ErrorSnackbarProvider>
                </ThemeProvider>
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export default function App() {
    return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    if (isRouteErrorResponse(error) && error.status === 404) {
        return <ErrorMessage message="404" details="The requested page could not be found." />;
    }
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
