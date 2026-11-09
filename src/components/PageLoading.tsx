import { Box, CircularProgress } from "@mui/material";

// Shown while a page's data is loading for the first time
export function PageLoading() {
    return (
        <Box sx={{ display: "flex", justifyContent: "center", p: 8 }}>
            <CircularProgress />
        </Box>
    );
}
