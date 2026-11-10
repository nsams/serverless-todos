import { Add, Delete, Move, Search } from "@dextinity/admin-icons";
import { Box, Button, Container, InputAdornment, Link as MuiLink, Paper, Stack, TextField, Typography } from "@mui/material";
import { DataGridPro, getGridDateOperators, getGridStringOperators, GridActionsCellItem } from "@mui/x-data-grid-pro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { useChatPage } from "~/chat/useChatPage";
import { CollectionHeader } from "~/components/CollectionHeader";
import { ConfirmDeleteDialog } from "~/components/ConfirmDeleteDialog";
import { NameDialog } from "~/components/NameDialog";
import { useMutate } from "~/components/useMutate";
import { useServerGrid } from "~/components/useServerGrid";
import { type GridColumns, supportedOperators } from "~/gridSearch";
import { linkProps, useLeaveDeleted, usePageTitle } from "~/routing";

import { notesApi } from "../api";
import { notesChatPage } from "../chatPage";
import type { NoteSummary } from "../db/notes.server";
import { plainExcerpt } from "../excerpt";
import { maxNotebookNameLength, maxNoteTitleLength } from "../limits";
import { noteFields } from "../noteSearch";
import { notebookRoute, notebooksRoute, noteRoute } from "../routes";

// /notes/:notebookId (notebookRoute): the notes of a notebook in a grid (pagination, sorting, filtering on the server, state in the URL);
// a note opens in the editor (note.tsx), which keeps the grid state for its back link
export default function NotebookPage() {
    const { notebook, notes, totalCount } = notebookRoute.useData();
    // the "move to" menu; empty while loading, the page doesn't wait for it
    const notebooks = useQuery(notesApi.listNotebooks.queryOptions({})).data ?? [];
    const navigate = useNavigate();
    const updateNote = useMutate(notesApi.updateNote.mutationOptions(), "Moving the note failed, please try again.");
    const deleteNote = useMutation(notesApi.deleteNote.mutationOptions());
    const [noteToDelete, setNoteToDelete] = useState<NoteSummary | null>(null);
    const { search, hasFilter, updateSearch, gridProps } = useServerGrid({
        search: notebookRoute.useSearch(),
        fields: noteFields,
        rows: notes,
        rowCount: totalCount,
    });
    usePageTitle(notebook.name);

    // what the assistant gets to know about the page
    useChatPage(notesChatPage, { notebookId: notebook.id });

    // the note's editor keeps the grid state for its back link
    const noteLink = (noteId: string) => noteRoute.link({ notebookId: notebook.id, noteId }, search);

    const columns: GridColumns<NoteSummary, typeof noteFields> = [
        {
            field: "title",
            headerName: "Title",
            flex: 1,
            minWidth: 150,
            filterOperators: supportedOperators(getGridStringOperators(), noteFields.title.operators),
            // a real link: keyboard, open in a new tab
            renderCell: ({ row }) => (
                <MuiLink component={Link} {...linkProps(noteLink(row.id))} underline="hover" color="inherit" sx={{ fontWeight: 500 }}>
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
                            // also reloads the sidebar's note counts
                            onClick={() => updateNote({ id: row.id, notebookId: otherNotebook.id })}
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
                                void navigate(noteLink(row.id).href);
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
                        // also reloads the sidebar's note counts
                        await deleteNote.mutateAsync({ id: noteToDelete.id });
                    }
                }}
            />
        </Container>
    );
}

function NewNoteButton({ notebookId }: { notebookId: string }) {
    const navigate = useNavigate();
    // opens the new note in the editor (the module's data, e.g. the sidebar's note counts, is reloaded afterwards)
    const createNote = useMutation(
        notesApi.createNote.mutationOptions({ onSuccess: ({ created }) => navigate(noteRoute.href({ notebookId, noteId: created.id })) }),
    );
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleCreate = async (title: string) => {
        await createNote.mutateAsync({ notebookId, title });
        setDialogOpen(false);
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
    const leave = useLeaveDeleted();
    const renameNotebook = useMutation(notesApi.renameNotebook.mutationOptions());
    // shows the first remaining notebook (or creates a new one); before the module's data is reloaded, so the deleted notebook isn't
    // loaded again
    const deleteNotebook = useMutation(
        notesApi.deleteNotebook.mutationOptions({
            onSuccess: () => leave(notebooksRoute.href(), notesApi.listNotes.queryFilter({ notebookId: notebook.id })),
        }),
    );

    return (
        <CollectionHeader
            name={notebook.name}
            kind="notebook"
            deleteText={`“${notebook.name}” and all its notes will be deleted.`}
            maxNameLength={maxNotebookNameLength}
            onRename={async (name) => {
                await renameNotebook.mutateAsync({ notebookId: notebook.id, name });
            }}
            onDelete={async () => {
                await deleteNotebook.mutateAsync({ notebookId: notebook.id });
            }}
        />
    );
}
