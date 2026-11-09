import "@fontsource-variable/roboto-flex";

import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { ErrorSnackbarProvider } from "~/components/ErrorSnackbar";
import { theme } from "~/theme";

import { router } from "./router";

// Entry of the app in the browser (index.html): a single-page application, its data comes from the REST API (src/api/)
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in index.html
createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <ErrorSnackbarProvider>
                <RouterProvider router={router} />
            </ErrorSnackbarProvider>
        </ThemeProvider>
    </StrictMode>,
);
