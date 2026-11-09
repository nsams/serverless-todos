import { Add, Delete, Move, Search } from "@dextinity/admin-icons";
import { Box, Button, Container, InputAdornment, Link as MuiLink, Paper, Stack, TextField, Typography } from "@mui/material";
import { DataGridPro, getGridDateOperators, getGridStringOperators, GridActionsCellItem, type GridColDef } from "@mui/x-data-grid-pro";
import { useState } from "react";
import { Link, type LoaderFunctionArgs, replace, useNavigate, useRevalidator } from "react-router";

import { api } from "~/api/client";
import { CollectionHeader } from "~/components/CollectionHeader";
import { ConfirmDeleteDialog } from "~/components/ConfirmDeleteDialog";
import { NameDialog } from "~/components/NameDialog";
import { useMutate } from "~/components/useMutate";
import { useServerGrid } from "~/components/useServerGrid";
import { lastPageWithRows, supportedOperators } from "~/gridSearch";
import { loadOrNotFound, requestSearch, useLoaderResult, usePageTitle } from "~/routing";
import { stringifySearch } from "~/searchParams";

import type { Notebook } from "../db/notebooks.server";
import type { NoteSummary } from "../db/notes.server";
import { plainExcerpt } from "../excerpt";
import { maxNotebookNameLength, maxNoteTitleLength } from "../limits";
import { useNotebooks } from "../navigation";
import { noteFields, parseNoteSearch, validateNoteSearch } from "../noteSearch";
import { notebookPath, notePath } from "../paths";

// /notes/:notebookId: the notes of a notebook in a grid (pagination, sorting, filtering on the server, state in the URL); a note opens
// in the editor (note.tsx), which keeps the grid state for its back link
export async function notebookLoader({ params, request }: LoaderFunctionArgs) {
    const notebookId = params.notebookId ?? "";
    const search = validateNoteSearch(requestSearch(request));
    const result = await loadOrNotFound(api.notes.list.query({ notebookId, ...search }, { signal: request.signal }));

    // e.g. after deleting the last note of the last page
    const lastPage = lastPageWithRows(parseNoteSearch(search), result.notes.length, result.totalCount);
    if (lastPage !== undefined) {
        throw replace(notebookPath(notebookId) + stringifySearch({ ...search, page: lastPage || undefined }));
    }

    return result;
}

export function NotebookPage() {
    const { notebook, notes, totalCount } = useLoaderResult<typeof notebookLoader>();
    const notebooks = useNotebooks();
    const navigate = useNavigate();
    const { revalidate } = useRevalidator();
    const mutate = useMutate();
    const [noteToDelete, setNoteToDelete] = useState<NoteSummary | null>(null);
    const { search, hasFilter, updateSearch, gridProps } = useServerGrid({
        validateSearch: validateNoteSearch,
        fields: noteFields,
        rowCount: totalCount,
    });
    usePageTitle(notebook.name);

    // the note's editor keeps the grid state for its back link
    const noteLink = (noteId: string) => notePath(notebook.id, noteId) + stringifySearch(search);
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
                        await revalidate();
                    }
                }}
            />
        </Container>
    );
}

function NewNoteButton({ notebookId }: { notebookId: string }) {
    const { revalidate } = useRevalidator();
    const navigate = useNavigate();
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleCreate = async (title: string) => {
        const result = await api.notes.create.mutate({ notebookId, title });
        if (result.id !== null) {
            setDialogOpen(false);
            await navigate(notePath(notebookId, result.id));
            // the sidebar's note counts aren't reloaded by the navigation (the layout route's loader data is reused)
            await revalidate();
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
    const { revalidate } = useRevalidator();
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
                    await revalidate();
                }
                return result.error;
            }}
            onDelete={async () => {
                await api.notebooks.delete.mutate({ id: notebook.id });
                // redirects to the first remaining notebook (or creates a new one)
                await navigate("/notes", { replace: true });
                // the sidebar's notebooks aren't reloaded by the navigation (the layout route's loader data is reused)
                await revalidate();
            }}
        />
    );
}
