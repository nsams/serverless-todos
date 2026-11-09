import { Add, Delete, Move, Search } from "@dextinity/admin-icons";
import { Box, Button, Container, InputAdornment, Link as MuiLink, Paper, Stack, TextField, Typography } from "@mui/material";
import { DataGridPro, getGridDateOperators, getGridStringOperators, GridActionsCellItem, type GridColDef } from "@mui/x-data-grid-pro";
import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { api, queryClient, trpc } from "~/api/client";
import { CollectionHeader } from "~/components/CollectionHeader";
import { ConfirmDeleteDialog } from "~/components/ConfirmDeleteDialog";
import { NameDialog } from "~/components/NameDialog";
import { PageLoading } from "~/components/PageLoading";
import { useMutate } from "~/components/useMutate";
import { useServerGrid } from "~/components/useServerGrid";
import { supportedOperators } from "~/gridSearch";
import { useApiQuery, usePageTitle, useRouteParams, useRouteSearch } from "~/routing";

import type { Notebook } from "../db/notebooks.server";
import type { NoteSummary } from "../db/notes.server";
import { plainExcerpt } from "../excerpt";
import { maxNotebookNameLength, maxNoteTitleLength } from "../limits";
import { noteFields } from "../noteSearch";
import { defaultNotebookRoute, notebookRoute, noteRoute } from "../paths";
import { invalidateNotebooks, invalidateNotes, useNotebooks } from "../queries";

// /notes/:notebookId: the notes of a notebook in a grid (pagination, sorting, filtering on the server, state in the URL); a note opens
// in the editor (note.tsx), which keeps the grid state for its back link
export function NotebookPage() {
    const { notebookId } = useRouteParams(notebookRoute);
    // a fresh page per notebook, the notes of the previous notebook aren't shown while the notebook is loading
    return <NotebookView key={notebookId} notebookId={notebookId} />;
}

function NotebookView({ notebookId }: { notebookId: string }) {
    const search = useRouteSearch(notebookRoute);
    // while the notes for new search params are loading, the grid shows the previous ones (with a loading indicator)
    const { data, isPlaceholderData } = useApiQuery(trpc.notes.list.queryOptions({ notebookId, ...search }, { placeholderData: keepPreviousData }));
    const notebooks = useNotebooks() ?? [];
    const navigate = useNavigate();
    const mutate = useMutate(invalidateNotes);
    const [noteToDelete, setNoteToDelete] = useState<NoteSummary | null>(null);
    const { hasFilter, updateSearch, gridProps } = useServerGrid({
        search,
        fields: noteFields,
        result: data && { rowsOnPage: data.notes.length, rowCount: data.totalCount },
        loading: isPlaceholderData,
    });
    usePageTitle(data?.notebook.name);

    if (!data) {
        return <PageLoading />;
    }
    const { notebook, notes } = data;

    // the note's editor keeps the grid state for its back link
    const noteLink = (noteId: string) => noteRoute.href({ notebookId: notebook.id, noteId }, search);
    const openNote = (noteId: string) => void navigate(noteLink(noteId));

    const columns: GridColDef<NoteSummary>[] = [
        {
            field: "title",
            headerName: "Title",
            flex: 1,
            minWidth: 150,
            filterOperators: supportedOperators(getGridStringOperators(), noteFields.title.operators),
            // a real link: keyboard, open in a new tab
            renderCell: ({ row }) => (
                <MuiLink component={Link} to={noteLink(row.id)} underline="hover" color="inherit" sx={{ fontWeight: 500 }}>
                    {row.title}
                </MuiLink>
            ),
        },
        {
            // filters the whole body, shows its beginning
            field: "body",
            headerName: "Text",
            flex: 2,
            minWidth: 150,
            sortable: false,
            filterOperators: supportedOperators(getGridStringOperators(), noteFields.body.operators),
            valueGetter: (_value, row) => plainExcerpt(row.excerpt),
            renderCell: ({ value }) => (
                <Typography component="span" variant="body2" color="text.secondary" noWrap>
                    {value}
                </Typography>
            ),
        },
        {
            field: "updatedAt",
            headerName: "Changed",
            type: "dateTime",
            width: 180,
            filterOperators: supportedOperators(getGridDateOperators(true), noteFields.updatedAt.operators),
        },
        {
            field: "createdAt",
            headerName: "Created",
            type: "dateTime",
            width: 180,
            filterOperators: supportedOperators(getGridDateOperators(true), noteFields.createdAt.operators),
        },
        {
            field: "actions",
            type: "actions",
            getActions: ({ row }) => [
                <GridActionsCellItem key="delete" icon={<Delete />} label="Delete" onClick={() => setNoteToDelete(row)} />,
                ...notebooks
                    .filter((otherNotebook) => otherNotebook.id !== notebook.id)
                    .map((otherNotebook) => (
                        <GridActionsCellItem
                            key={`move-${otherNotebook.id}`}
                            icon={<Move />}
                            label={`Move to “${otherNotebook.name}”`}
                            showInMenu
                            onClick={() =>
                                // also reloads the sidebar's note counts
                                void mutate(
                                    api.notes.update.mutate({ id: row.id, notebookId: otherNotebook.id }),
                                    "Moving the note failed, please try again.",
                                )
                            }
                        />
                    )),
            ],
        },
    ];

    return (
        <Container sx={{ py: 4 }}>
            <Stack spacing={2}>
                <NotebookHeader notebook={notebook} />
                <Box sx={{ display: "flex", gap: 1, flexWrap: { xs: "wrap", sm: "nowrap" } }}>
                    <TextField
                        type="search"
                        size="small"
                        fullWidth
                        placeholder="Search in title and text"
                        value={search.q ?? ""}
                        // no history entry per keystroke
                        onChange={(event) => updateSearch({ q: event.target.value || undefined }, { replace: true })}
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
                    <NewNoteButton notebookId={notebook.id} />
                </Box>
                <Paper>
                    <DataGridPro
                        rows={notes}
                        columns={columns}
                        autoHeight
                        disableRowSelectionOnClick
                        {...gridProps}
                        // the whole row opens the note (the title is the link for keyboard users)
                        onCellClick={({ field, row }, event) => {
                            // a click on the title link is handled by the link (e.g. ctrl-click opens a new tab)
                            if (field !== "actions" && !(event.target instanceof Element && event.target.closest("a"))) {
                                openNote(row.id);
                            }
                        }}
                        localeText={{ noRowsLabel: search.q || hasFilter ? "No notes found." : "No notes yet." }}
                        sx={{ "& .MuiDataGrid-row": { cursor: "pointer" } }}
                    />
                </Paper>
            </Stack>
            <ConfirmDeleteDialog
                open={noteToDelete !== null}
                title="Delete note?"
                text={`“${noteToDelete?.title ?? ""}” will be deleted.`}
                errorMessage="Deleting the note failed, please try again."
                onClose={() => setNoteToDelete(null)}
                onDelete={async () => {
                    if (noteToDelete) {
                        await api.notes.delete.mutate({ id: noteToDelete.id });
                        // also the sidebar's note counts
                        await invalidateNotes();
                    }
                }}
            />
        </Container>
    );
}

function NewNoteButton({ notebookId }: { notebookId: string }) {
    const navigate = useNavigate();
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleCreate = async (title: string) => {
        const result = await api.notes.create.mutate({ notebookId, title });
        if (result.id !== null) {
            setDialogOpen(false);
            await navigate(noteRoute.href({ notebookId, noteId: result.id }));
            // the sidebar's note counts
            await invalidateNotebooks();
        }
        return result.error;
    };

    return (
        <>
            <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)} sx={{ flexShrink: 0 }}>
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
    const navigate = useNavigate();

    return (
        <CollectionHeader
            name={notebook.name}
            kind="notebook"
            deleteText={`“${notebook.name}” and all its notes will be deleted.`}
            maxNameLength={maxNotebookNameLength}
            onRename={async (name) => {
                const result = await api.notebooks.rename.mutate({ id: notebook.id, name });
                if (result.error === null) {
                    await invalidateNotes();
                }
                return result.error;
            }}
            onDelete={async () => {
                await api.notebooks.delete.mutate({ id: notebook.id });
                // redirects to the first remaining notebook (or creates a new one) and reloads the notebooks in the sidebar
                await navigate(defaultNotebookRoute.href(), { replace: true });
                // not reloaded now (the page is being left), but when it is shown again (e.g. browser back: 404)
                await queryClient.invalidateQueries({ ...trpc.notes.list.queryFilter({ notebookId: notebook.id }), refetchType: "none" });
            }}
        />
    );
}
