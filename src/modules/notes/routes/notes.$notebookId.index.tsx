import { Paper, Typography } from "@mui/material";
import { createFileRoute } from "@tanstack/react-router";

// No note open (only shown on wide screens, next to the notes)
export const Route = createFileRoute("/_app/notes/$notebookId/")({
    component: () => (
        <Paper sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">Select a note or create a new one.</Typography>
        </Paper>
    ),
});
