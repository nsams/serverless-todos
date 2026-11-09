import { Add, Delete, Move, Search } from "@dextinity/admin-icons";
import { Box, Button, Container, InputAdornment, Link as MuiLink, Paper, Stack, TextField, Typography } from "@mui/material";
import { DataGridPro, getGridDateOperators, getGridStringOperators, GridActionsCellItem, type GridColDef } from "@mui/x-data-grid-pro";
import { useState } from "react";
import { data, href, Link, redirect, useNavigate } from "react-router";

import { appName } from "~/app";
import { CollectionHeader } from "~/components/CollectionHeader";
import { ConfirmDeleteDialog } from "~/components/ConfirmDeleteDialog";
import { NameDialog } from "~/components/NameDialog";
import { useIntents } from "~/components/useIntents";
import { useMutate } from "~/components/useMutate";
import { useServerGrid } from "~/components/useServerGrid";
import { userContext } from "~/context";
import { lastPageWithRows, supportedOperators } from "~/gridSearch";
import { clientIntentAction, intentAction } from "~/intents";
import { parseSearch, stringifySearch } from "~/searchParams";

import { getNotebookRepository, type Notebook } from "../db/notebooks.server";
import { getNoteRepository, type NoteSummary } from "../db/notes.server";
import { plainExcerpt } from "../excerpt";
import { type NotebookIntents, notebookIntents } from "../intents.server";
import { maxNotebookNameLength, maxNoteTitleLength } from "../limits";
import { useNotebooks } from "../navigation";
import { noteFields, parseNoteSearch, validateNoteSearch } from "../noteSearch";
import type { Route } from "./+types/notes.$notebookId.index";

// The notes of a notebook in a grid (pagination, sorting, filtering on the server, state in the URL); a note opens in the editor
// (notes.$notebookId.$noteId.tsx), which keeps the grid state for its back link
export async function loader({ params: { notebookId }, url, context }: Route.LoaderArgs) {
    const user = context.get(userContext);
    const notebook = await getNotebookRepository().get(user.id, notebookId);
    if (!notebook) {
        throw data("Notebook not found", { status: 404 });
    }
    const search = validateNoteSearch(parseSearch(url.search));
    const { page, pageSize, sort, filter, query } = parseNoteSearch(search);
    const { rows, totalCount } = await getNoteRepository().list(user.id, notebookId, {
        offset: page * pageSize,
        limit: pageSize,
        sort,
        filter,
        query,
    });

    // e.g. after deleting the last note of the last page
    const lastPage = lastPageWithRows({ page, pageSize }, rows.length, totalCount);
    if (lastPage !== undefined) {
        throw redirect(href("/notes/:notebookId", { notebookId }) + stringifySearch({ ...search, page: lastPage || undefined }));
    }

    return { notebook, notes: rows, totalCount };
}

// renames and deletes the notebook, creates, moves and deletes its notes
export const action = intentAction(notebookIntents);
export const clientAction = clientIntentAction;

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: loaderData ? `${loaderData.notebook.name} – ${appName}` : appName }];

export default function NotebookPage({ loaderData: { notebook, notes, totalCount } }: Route.ComponentProps) {
    const notebooks = useNotebooks();
    const navigate = useNavigate();
    const { submit } = useIntents<NotebookIntents>(href("/notes/:notebookId", { notebookId: notebook.id }));
    const mutate = useMutate();
    const [noteToDelete, setNoteToDelete] = useState<NoteSummary | null>(null);
    const { search, hasFilter, updateSearch, gridProps } = useServerGrid({
        validateSearch: validateNoteSearch,
        fields: noteFields,
        navigate: (newSearch, { replace }) => void navigate({ search: stringifySearch(newSearch) }, { replace, preventScrollReset: true }),
        rowCount: totalCount,
    });

    // the note keeps the grid state for its back link
    const noteUrl = (noteId: string) => href("/notes/:notebookId/:noteId", { notebookId: notebook.id, noteId }) + stringifySearch(search);
    const openNote = (noteId: string) => void navigate(noteUrl(noteId));

    const columns: GridColDef<NoteSummary>[] = [
        {
            field: "title",
            headerName: "Title",
            flex: 1,
            minWidth: 150,
            filterOperators: supportedOperators(getGridStringOperators(), noteFields.title.operators),
            // a real link: keyboard, open in a new tab
            renderCell: ({ row }) => (
                <MuiLink component={Link} to={noteUrl(row.id)} underline="hover" color="inherit" sx={{ fontWeight: 500 }}>
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
                                    submit("moveNote", { id: row.id, notebookId: otherNotebook.id }),
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
                        // also reloads the sidebar's note counts
                        await submit("deleteNote", { id: noteToDelete.id });
                    }
                }}
            />
        </Container>
    );
}

function NewNoteButton({ notebookId }: { notebookId: string }) {
    const { submit } = useIntents<NotebookIntents>(href("/notes/:notebookId", { notebookId }));
    const [dialogOpen, setDialogOpen] = useState(false);

    // goes to the new note
    const handleCreate = async (title: string) => {
        const error = (await submit("createNote", { title }))?.error ?? null;
        if (error === null) {
            setDialogOpen(false);
        }
        return error;
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
    const { submit } = useIntents<NotebookIntents>(href("/notes/:notebookId", { notebookId: notebook.id }));

    return (
        <CollectionHeader
            name={notebook.name}
            kind="notebook"
            deleteText={`“${notebook.name}” and all its notes will be deleted.`}
            maxNameLength={maxNotebookNameLength}
            onRename={async (name) => (await submit("renameNotebook", { name }))?.error ?? null}
            // goes to the first remaining notebook (or a new one)
            onDelete={async () => {
                await submit("deleteNotebook", {});
            }}
        />
    );
}
