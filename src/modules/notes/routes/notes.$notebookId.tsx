import { Add, Delete, Edit, Search } from "@dextinity/admin-icons";
import {
    Box,
    Button,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    InputAdornment,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { createFileRoute, createLink, Outlet, useMatch, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { appName } from "~/app";
import { useShowError } from "~/components/ErrorSnackbar";
import { NameDialog } from "~/components/NameDialog";

import { DateTime } from "../components/DateTime";
import type { Notebook } from "../db/notebooks.server";
import { plainExcerpt } from "../excerpt";
import { maxNotebookNameLength, maxNoteTitleLength } from "../limits";
import { deleteNotebook, renameNotebook } from "../notebooks.functions";
import { createNote, listNotes } from "../notes.functions";
import { validateNoteSearch } from "../noteSearch";

// A notebook: its notes (searchable) next to the open note (child routes: notes.$notebookId.index.tsx, notes.$notebookId.$noteId.tsx).
// On small screens either the notes or the open note are shown.
export const Route = createFileRoute("/_app/notes/$notebookId")({
    validateSearch: validateNoteSearch,
    loaderDeps: ({ search: { q } }) => ({ q }),
    loader: async ({ params: { notebookId }, deps: { q } }) => listNotes({ data: { notebookId, query: q } }),
    head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.notebook.name} – ${appName}` : appName }] }),
    component: NotebookPage,
});

const ListItemLink = createLink(ListItemButton);

function NotebookPage() {
    const { notebook, notes } = Route.useLoaderData();
    const navigate = Route.useNavigate();
    // the pending location while loading, so the search field doesn't lag behind typing
    const q = useRouterState({ select: (state) => validateNoteSearch(state.location.search).q });
    const noteOpen = useMatch({ from: "/_app/notes/$notebookId/$noteId", shouldThrow: false }) !== undefined;

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Stack spacing={2}>
                <NotebookHeader notebook={notebook} />
                <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                    <Paper
                        component="section"
                        aria-label="Notes"
                        sx={{
                            width: { xs: "100%", md: 320 },
                            flexShrink: 0,
                            display: { xs: noteOpen ? "none" : "block", md: "block" },
                        }}
                    >
                        <Stack spacing={1} sx={{ p: 2, pb: 1 }}>
                            <NewNoteButton notebookId={notebook.id} />
                            <TextField
                                type="search"
                                size="small"
                                placeholder="Search notes"
                                value={q ?? ""}
                                onChange={(event) =>
                                    // no history entry per keystroke
                                    void navigate({
                                        search: (prev) => ({ ...prev, q: event.target.value || undefined }),
                                        replace: true,
                                        resetScroll: false,
                                    })
                                }
                                slotProps={{
                                    htmlInput: { "aria-label": "Search notes" },
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Search />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                            />
                        </Stack>
                        {notes.length === 0 ? (
                            <Typography color="text.secondary" sx={{ p: 2 }}>
                                {q ? "No notes found." : "No notes yet."}
                            </Typography>
                        ) : (
                            <List>
                                {notes.map((note) => (
                                    <ListItemLink
                                        key={note.id}
                                        to="/notes/$notebookId/$noteId"
                                        params={{ notebookId: notebook.id, noteId: note.id }}
                                        search={{ q }}
                                        activeProps={{ selected: true }}
                                        alignItems="flex-start"
                                    >
                                        <ListItemText
                                            primary={note.title}
                                            secondary={
                                                <>
                                                    <DateTime value={note.updatedAt} />
                                                    {note.excerpt && ` – ${plainExcerpt(note.excerpt)}`}
                                                </>
                                            }
                                            slotProps={{
                                                primary: { noWrap: true },
                                                secondary: {
                                                    sx: {
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                    },
                                                },
                                            }}
                                        />
                                    </ListItemLink>
                                ))}
                            </List>
                        )}
                    </Paper>
                    <Box sx={{ flexGrow: 1, minWidth: 0, display: { xs: noteOpen ? "block" : "none", md: "block" } }}>
                        <Outlet />
                    </Box>
                </Box>
            </Stack>
        </Container>
    );
}

function NewNoteButton({ notebookId }: { notebookId: string }) {
    const router = useRouter();
    const navigate = useNavigate();
    const createNoteFn = useServerFn(createNote);
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleCreate = async (title: string) => {
        const result = await createNoteFn({ data: { notebookId, title } });
        if (result.id !== null) {
            setDialogOpen(false);
            // without the search: the new note wouldn't match it
            await navigate({ to: "/notes/$notebookId/$noteId", params: { notebookId, noteId: result.id } });
            // the sidebar's note counts aren't reloaded by the navigation (the layout route's loader data is reused)
            await router.invalidate();
        }
        return result.error;
    };

    return (
        <>
            <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
                New note
            </Button>
            <NameDialog
                open={dialogOpen}
                title="New note"
                label="Title"
                submitLabel="Create"
                maxLength={maxNoteTitleLength}
                onClose={() => setDialogOpen(false)}
                onSubmit={handleCreate}
            />
        </>
    );
}

function NotebookHeader({ notebook }: { notebook: Notebook }) {
    const router = useRouter();
    const navigate = useNavigate();
    const renameNotebookFn = useServerFn(renameNotebook);
    const deleteNotebookFn = useServerFn(deleteNotebook);
    const showError = useShowError();
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleRename = async (name: string) => {
        const result = await renameNotebookFn({ data: { id: notebook.id, name } });
        if (result.error === null) {
            setRenameDialogOpen(false);
            await router.invalidate();
        }
        return result.error;
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await deleteNotebookFn({ data: { id: notebook.id } });
            setDeleteDialogOpen(false);
            // redirects to the first remaining notebook (or creates a new one)
            await navigate({ to: "/notes", replace: true });
            // the sidebar's notebooks aren't reloaded by the navigation (the layout route's loader data is reused)
            await router.invalidate();
        } catch (error) {
            console.error(error);
            showError("Deleting the notebook failed, please try again.");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h5" component="h1" sx={{ flexGrow: 1, overflowWrap: "anywhere" }}>
                {notebook.name}
            </Typography>
            <Tooltip title="Rename notebook">
                <IconButton onClick={() => setRenameDialogOpen(true)} aria-label="Rename notebook">
                    <Edit />
                </IconButton>
            </Tooltip>
            <Tooltip title="Delete notebook">
                <IconButton onClick={() => setDeleteDialogOpen(true)} aria-label="Delete notebook">
                    <Delete />
                </IconButton>
            </Tooltip>
            <NameDialog
                open={renameDialogOpen}
                title="Rename notebook"
                submitLabel="Rename"
                initialName={notebook.name}
                maxLength={maxNotebookNameLength}
                onClose={() => setRenameDialogOpen(false)}
                onSubmit={handleRename}
            />
            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>Delete notebook?</DialogTitle>
                <DialogContent>
                    <DialogContentText>“{notebook.name}” and all its notes will be deleted.</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button color="error" variant="contained" disabled={deleting} onClick={() => void handleDelete()}>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
