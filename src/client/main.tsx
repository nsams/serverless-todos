import "@fontsource-variable/inter";
import "./global.css";

import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { ErrorSnackbarProvider } from "~/components/ErrorSnackbar";
import { theme } from "~/theme";

import { AppRoutes } from "./AppRoutes";
import { queryClient } from "./queries";

// Entry of the app in the browser (index.html): a single-page application, its data comes from the REST API (src/api/)

// The router: a data router with a single catch-all route that renders the app's declarative <Routes> (AppRoutes.tsx). Only because
// React Router's navigation blocking (useBlocker, for the "Save changes?" dialog of forms: src/components/useUnsavedChangesPrompt.tsx)
// needs a data router, in a <BrowserRouter> it throws. The routes stay declarative (<Routes>/<Route>, no loaders, actions or route
// objects per page), the data stays in TanStack Query: the data router only adds the blocking (and handles the history itself).
// This bends "declarative mode": the alternative would be intercepting link clicks and popstate by hand, which is fragile.
const router = createBrowserRouter([{ path: "*", Component: AppRoutes }]);

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in index.html
createRoot(document.getElementById("root")!).render(
    <StrictMode>
        {/* only for the MUI X components (grids, chat); the app's own components are @dextinity/ui, its color scheme is set in index.html */}
        <ThemeProvider theme={theme}>
            <ErrorSnackbarProvider>
                <QueryClientProvider client={queryClient}>
                    {/* Navigations aren't transitions: a page shows the new URL right away (e.g. the grid's search field while typing) and
                        keeps showing its previous data while the data for it is loading itself (usePageQuery) */}
                    <RouterProvider router={router} useTransitions={false} />
                </QueryClientProvider>
            </ErrorSnackbarProvider>
        </ThemeProvider>
    </StrictMode>,
);
