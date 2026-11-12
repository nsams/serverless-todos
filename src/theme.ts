import { createTheme } from "@mui/material/styles";

// The theme of the MUI X components that @dextinity/ui has no replacement for (the DataGridPro grids, the MUI X Chat of the assistant):
// matched to the @dextinity/ui design tokens (font, primary and error color of the light color scheme). MUI computes shades from the
// colors, so they are values here, not the CSS variables.
export const theme = createTheme({
    typography: {
        fontFamily: "'Inter Variable', system-ui, sans-serif",
    },
    palette: {
        // --dextinity-color-action-primary-default
        primary: { main: "rgb(64 58 242)" },
        // --dextinity-color-action-error-default
        error: { main: "rgb(188 53 32)" },
        text: {
            // --dextinity-color-foreground-default
            primary: "rgb(39 41 46)",
        },
    },
    shape: {
        borderRadius: 8,
    },
});
