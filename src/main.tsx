import "@fontsource-variable/roboto-flex";

import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import { queryClient } from "./api/query";
import { ErrorSnackbarProvider } from "./components/ErrorSnackbar";
import { router } from "./router";
import { theme } from "./theme";

// Browser entry (index.html): a single-page app, its data comes from the API (src/api/)
const root = document.getElementById("root");
if (!root) {
    throw new Error("Root element not found");
}
createRoot(root).render(
    <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorSnackbarProvider>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </ErrorSnackbarProvider>
    </ThemeProvider>,
);
