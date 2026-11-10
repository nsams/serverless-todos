import { Add, Delete, Move, Search } from "@dextinity/admin-icons";
import { Box, Button, Container, InputAdornment, Link as MuiLink, Paper, Stack, TextField, Typography } from "@mui/material";
import { DataGridPro, getGridDateOperators, getGridStringOperators, GridActionsCellItem } from "@mui/x-data-grid-pro";
import { createFileRoute, createLink, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { pageHead } from "~/app";
import { useChatPage } from "~/chat/useChatPage";
import { CollectionHeader } from "~/components/CollectionHeader";
import { ConfirmDeleteDialog } from "~/components/ConfirmDeleteDialog";
import { NameDialog } from "~/components/NameDialog";
import { useMutate } from "~/components/useMutate";
import { useServerGrid } from "~/components/useServerGrid";
import { type GridColumns, supportedOperators } from "~/gridSearch";
import { useInvalidateModule, usePageQuery } from "~/moduleQueries";

import { notesChatPage } from "../chatPage";
import type { NoteSummary } from "../db/notes.server";
import { plainExcerpt } from "../excerpt";
import { maxNotebookNameLength, maxNoteTitleLength } from "../limits";
import { notesModuleId } from "../moduleId";
import { deleteNotebook, renameNotebook } from "../notebooks.functions";
import { createNote, deleteNote, updateNote } from "../notes.functions";
import { noteFields, validateNoteSearch } from "../noteSearch";
import { notesQuery, useNotebooks } from "../queries";

// The notes of a notebook in a grid (pagination, sorting, filtering on the server, state in the URL); a note opens in the editor
// (notes.$notebookId.$noteId.tsx), which keeps the grid state for its back link
export const Route = createFileRoute("/_app/notes/$notebookId/")({
    validateSearch: validateNoteSearch,
    loaderDeps: ({ search }) => search,
    loader: async ({ context: { queryClient }, params: { notebookId }, deps }) => {
        const { notebook } = await queryClient.fetchQuery(notesQuery({ ...deps, notebookId }));
        return { title: notebook.name };
    },
    head: ({ loaderData }) => pageHead(loaderData?.title),
    component: NotebookPage,
});

const LinkCell = createLink(MuiLink);

function NotebookPage() {
    const { notebookId } = Route.useParams();
    const { notebook, notes, totalCount } = usePageQuery(notesQuery({ ...Route.useSearch(), notebookId }));
    const notebooks = useNotebooks();
    const navigate = Route.useNavigate();
    const invalidate = useInvalidateModule(notesModuleId);
    const mutate = useMutate(notesModuleId);
    const [noteToDelete, setNoteToDelete] = useState<NoteSummary | null>(null);
    const { search, hasFilter, updateSearch, gridProps } = useServerGrid({
        validateSearch: validateNoteSearch,
        fields: noteFields,
        navigate: (newSearch, { replace }) => void navigate({ search: newSearch, replace, resetScroll: false }),
        rows: notes,
        rowCount: totalCount,
    });

    // what the assistant gets to know about the page
    useChatPage(notesChatPage, { notebookId: notebook.id });

    const openNote = (noteId: string) => void navigate({ to: "/notes/$notebookId/$noteId", params: { notebookId: notebook.id, noteId }, search });

    const columns: GridColumns<NoteSummary, typeof noteFields> = [
        {
            field: "title",
            headerName: "Title",
            flex: 1,
            minWidth: 150,
            filterOperators: supportedOperators(getGridStringOperators(), noteFields.title.operators),
            // a real link: keyboard, open in a new tab
            renderCell: ({ row }) => (
                <LinkCell
                    to="/notes/$notebookId/$noteId"
                    params={{ notebookId: notebook.id, noteId: row.id }}
                    search={search}
                    underline="hover"
                    color="inherit"
                    sx={{ fontWeight: 500 }}
                >
                    {row.title}
                </LinkCell>
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
                                    updateNote({ data: { id: row.id, notebookId: otherNotebook.id } }),
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
                        await deleteNote({ data: { id: noteToDelete.id } });
                        // also the sidebar's note counts
                        await invalidate();
                    }
                }}
            />
        </Container>
    );
}

function NewNoteButton({ notebookId }: { notebookId: string }) {
    const navigate = useNavigate();
    const invalidate = useInvalidateModule(notesModuleId);
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleCreate = async (title: string) => {
        const { created } = await createNote({ data: { notebookId, title } });
        setDialogOpen(false);
        await navigate({ to: "/notes/$notebookId/$noteId", params: { notebookId, noteId: created.id } });
        // e.g. the sidebar's note counts
        void invalidate();
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

function NotebookHeader({ notebook }: { notebook: { id: string; name: string } }) {
    const navigate = useNavigate();
    const invalidate = useInvalidateModule(notesModuleId);

    return (
        <CollectionHeader
            name={notebook.name}
            kind="notebook"
            deleteText={`“${notebook.name}” and all its notes will be deleted.`}
            maxNameLength={maxNotebookNameLength}
            onRename={async (name) => {
                await renameNotebook({ data: { notebookId: notebook.id, name } });
                await invalidate();
            }}
            onDelete={async () => {
                await deleteNotebook({ data: { notebookId: notebook.id } });
                // redirects to the first remaining notebook (or creates a new one); reloaded afterwards, so the deleted notebook isn't reloaded
                await navigate({ to: "/notes", replace: true });
                void invalidate();
            }}
        />
    );
}
