import "@fontsource-variable/roboto-flex";

import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { ErrorSnackbarProvider } from "~/components/ErrorSnackbar";
import { theme } from "~/theme";

import { AppRoutes } from "./AppRoutes";
import { queryClient } from "./queries";

// Entry of the app in the browser (index.html): a single-page application, its data comes from the REST API (src/api/)
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in index.html
createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <ErrorSnackbarProvider>
                <QueryClientProvider client={queryClient}>
                    {/* Navigations aren't transitions: a page shows the new URL right away (e.g. the grid's search field while typing) and
                        keeps showing its previous data while the data for it is loading itself (usePageQuery) */}
                    <BrowserRouter useTransitions={false}>
                        <AppRoutes />
                    </BrowserRouter>
                </QueryClientProvider>
            </ErrorSnackbarProvider>
        </ThemeProvider>
    </StrictMode>,
);
