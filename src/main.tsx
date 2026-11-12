import "@fontsource-variable/roboto-flex";

import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { queryClient } from "./api/client";
import { ErrorSnackbarProvider } from "./components/ErrorSnackbar";
import { NotFoundError } from "./errors";
import { AppRoutes } from "./router";
import { RouteErrorBoundary } from "./routes/root";
import { theme } from "./theme";

// Browser entry (index.html): a single-page app, its data comes from the API (src/api/)

// The routes are declarative (<Routes> in src/router.tsx, defineRoute in src/routing.tsx), but React Router runs as a minimal data
// router around them instead of <BrowserRouter>: a single splat route renders them (no loaders, no actions, no other route objects).
// Only for useBlocker (the "Save changes?" dialog of a form, src/components/useUnsavedChangesPrompt.tsx), which throws "useBlocker
// must be used within a data router" in a <BrowserRouter>: declarative mode has no way to block navigations (back/forward included).
// Trade-off: the app depends on the data router's runtime (navigations go through router.navigate) although it uses none of data
// mode's features; everything else (links, useNavigate, useParams, the transitions) works as with <BrowserRouter>.
const router = createBrowserRouter([
    {
        path: "*",
        Component: function Root() {
            return (
                // errors outside of the pages, e.g. of the sidebar
                <RouteErrorBoundary>
                    <AppRoutes />
                </RouteErrorBoundary>
            );
        },
    },
]);

const root = document.getElementById("root");
if (!root) {
    throw new Error("Root element not found");
}
createRoot(root, {
    // errors shown by an error boundary (src/routes/root.tsx); a 404 isn't an error of the app
    onCaughtError: (error, { componentStack }) => {
        if (!(error instanceof NotFoundError)) {
            console.error(error, componentStack);
        }
    },
}).render(
    <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorSnackbarProvider>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </ErrorSnackbarProvider>
    </ThemeProvider>,
);
