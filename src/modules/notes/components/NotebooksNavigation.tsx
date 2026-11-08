import { Add } from "@dextinity/admin-icons";
import { Divider, List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { createLink, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { NameDialog } from "~/components/NameDialog";

import { maxNotebookNameLength } from "../limits";
import { useNotebooks } from "../navigation";
import { createNotebook } from "../notebooks.functions";

const ListItemLink = createLink(ListItemButton);

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const notebooks = useNotebooks();
    const navigate = useNavigate();
    const createNotebookFn = useServerFn(createNotebook);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const handleCreateNotebook = async (name: string) => {
        const result = await createNotebookFn({ data: { name } });
        if (result.id !== null) {
            setCreateDialogOpen(false);
            onNavigate();
            await navigate({ to: "/notes/$notebookId", params: { notebookId: result.id } });
        }
        return result.error;
    };

    return (
        <>
            <List>
                {notebooks.map((notebook) => (
                    <ListItemLink
                        key={notebook.id}
                        to="/notes/$notebookId"
                        params={{ notebookId: notebook.id }}
                        // also active while a note of the notebook is open
                        activeOptions={{ includeSearch: false }}
                        activeProps={{ selected: true }}
                        onClick={onNavigate}
                    >
                        <ListItemText primary={notebook.name} slotProps={{ primary: { noWrap: true } }} />
                        {notebook.noteCount > 0 && (
                            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }} aria-label={`${notebook.noteCount} notes`}>
                                {notebook.noteCount}
                            </Typography>
                        )}
                    </ListItemLink>
                ))}
            </List>
            <Divider />
            <List>
                <ListItemButton onClick={() => setCreateDialogOpen(true)}>
                    <ListItemIcon>
                        <Add />
                    </ListItemIcon>
                    <ListItemText primary="New notebook" />
                </ListItemButton>
            </List>
            <NameDialog
                open={createDialogOpen}
                title="New notebook"
                submitLabel="Create"
                maxLength={maxNotebookNameLength}
                onClose={() => setCreateDialogOpen(false)}
                onSubmit={handleCreateNotebook}
            />
        </>
    );
}
