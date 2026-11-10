import { Add, Delete, Move, Search } from "@dextinity/admin-icons";
import { Box, Button, Container, InputAdornment, Link as MuiLink, Paper, Stack, TextField, Typography } from "@mui/material";
import { DataGridPro, getGridDateOperators, getGridStringOperators, GridActionsCellItem } from "@mui/x-data-grid-pro";
import { useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { useChatPage } from "~/chat/useChatPage";
import { useInvalidateModule, usePageQuery } from "~/client/queries";
import { CollectionHeader } from "~/components/CollectionHeader";
import { ConfirmDeleteDialog } from "~/components/ConfirmDeleteDialog";
import { NameDialog } from "~/components/NameDialog";
import { useDocumentTitle } from "~/components/useDocumentTitle";
import { useMutate } from "~/components/useMutate";
import { useServerGrid } from "~/components/useServerGrid";
import { type GridColumns, supportedOperators } from "~/gridSearch";

import { notesClient } from "../api";
import { notesChatPage } from "../chatPage";
import { plainExcerpt } from "../excerpt";
import { maxNotebookNameLength, maxNoteTitleLength } from "../limits";
import { notesModuleId } from "../moduleId";
import { noteFields } from "../noteSearch";
import { noteQuery, notesQuery, useNotebooks } from "../queries";
import { notebookRoute, notebooksRoute, noteRoute } from "../routes";

type NoteSummary = InferResponseType<(typeof notesClient.notebooks)[":notebookId"]["notes"]["$get"], 200>["notes"][number];

// The notes of a notebook in a grid (pagination, sorting, filtering on the server, state in the URL), see notebookRoute; a note opens
// in the editor (NotePage.tsx), which keeps the grid state for its back link
export default function NotebookPage() {
    const { notebookId } = notebookRoute.useParams();
    const search = notebookRoute.useSearch();
    const {
        data: { notebook, notes, totalCount },
        loading,
    } = usePageQuery(notesQuery, { notebookId, ...search });
    const notebooks = useNotebooks();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const mutate = useMutate(notesModuleId);
    const invalidate = useInvalidateModule(notesModuleId);
    const [noteToDelete, setNoteToDelete] = useState<NoteSummary | null>(null);
    const { hasFilter, updateSearch, gridProps } = useServerGrid({ search, fields: noteFields, rows: notes, rowCount: totalCount, loading });
    useDocumentTitle(notebook.name);
    // what the assistant gets to know about the page
    useChatPage(notesChatPage, { notebookId: notebook.id });

    // the note in the editor, with the grid state for its back link
    const noteLink = (noteId: string) => noteRoute.href({ notebookId: notebook.id, noteId }, search);
    const openNote = (noteId: string) => void navigate(noteLink(noteId));

    const columns: GridColumns<NoteSummary, typeof noteFields> = [
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
            // an ISO string in the API's JSON
            valueGetter: (value: string) => new Date(value),
        },
        {
            field: "createdAt",
            headerName: "Created",
            type: "dateTime",
            width: 180,
            filterOperators: supportedOperators(getGridDateOperators(true), noteFields.createdAt.operators),
            valueGetter: (value: string) => new Date(value),
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
                                    parseResponse(notesClient.notes[":id"].$patch({ param: { id: row.id }, json: { notebookId: otherNotebook.id } })),
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
                        // the note is loaded ahead while the pointer is over its row, so the editor shows it right away when it is opened
                        slotProps={{
                            row: {
                                onMouseEnter: (event) => {
                                    const noteId = event.currentTarget.dataset.id;
                                    if (noteId) {
                                        void queryClient.prefetchQuery(noteQuery(noteId));
                                    }
                                },
                            },
                        }}
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
                        await parseResponse(notesClient.notes[":id"].$delete({ param: { id: noteToDelete.id } }));
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
        const { created } = await parseResponse(notesClient.notebooks[":notebookId"].notes.$post({ param: { notebookId }, json: { title } }));
        setDialogOpen(false);
        await navigate(noteRoute.href({ notebookId, noteId: created.id }));
        // the sidebar's note counts and the notebook's notes
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
    return (
        <CollectionHeader
            moduleId={notesModuleId}
            name={notebook.name}
            kind="notebook"
            deleteText={`“${notebook.name}” and all its notes will be deleted.`}
            maxNameLength={maxNotebookNameLength}
            onRename={(name) => parseResponse(notesClient.notebooks[":notebookId"].$patch({ param: { notebookId: notebook.id }, json: { name } }))}
            onDelete={async () => {
                await parseResponse(notesClient.notebooks[":notebookId"].$delete({ param: { notebookId: notebook.id } }));
                // redirects to the first remaining notebook (or creates a new one)
                return notebooksRoute.href();
            }}
        />
    );
}
