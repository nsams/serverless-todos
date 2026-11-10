import "@fontsource-variable/roboto-flex";

import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { queryClient } from "./api/client";
import { ErrorSnackbarProvider } from "./components/ErrorSnackbar";
import { NotFoundError } from "./errors";
import { AppRoutes } from "./router";
import { RouteErrorBoundary } from "./routes/root";
import { theme } from "./theme";

// Browser entry (index.html): a single-page app, its data comes from the API (src/api/)
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
                <BrowserRouter>
                    {/* errors outside of the pages, e.g. of the sidebar */}
                    <RouteErrorBoundary>
                        <AppRoutes />
                    </RouteErrorBoundary>
                </BrowserRouter>
            </QueryClientProvider>
        </ErrorSnackbarProvider>
    </ThemeProvider>,
);
