import { Add, Delete, Edit, Move, Search } from "@dextinity/admin-icons";
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
    Link as MuiLink,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    DataGridPro,
    getGridDateOperators,
    getGridStringOperators,
    GridActionsCellItem,
    type GridColDef,
    type GridFilterModel,
    GridLogicOperator,
    type GridSortModel,
} from "@mui/x-data-grid-pro";
import { createFileRoute, createLink, redirect, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { appName } from "~/app";
import { useShowError } from "~/components/ErrorSnackbar";
import { NameDialog } from "~/components/NameDialog";
import { pageSizeOptions, serializeFilterValue, supportedOperators } from "~/gridSearch";

import { DeleteNoteDialog } from "../components/DeleteNoteDialog";
import type { Notebook } from "../db/notebooks.server";
import type { NoteSummary } from "../db/notes.server";
import { plainExcerpt } from "../excerpt";
import { maxNotebookNameLength, maxNoteTitleLength } from "../limits";
import { useNotebooks } from "../navigation";
import { deleteNotebook, renameNotebook } from "../notebooks.functions";
import { createNote, deleteNote, listNotes, updateNote } from "../notes.functions";
import { noteFields, type NoteSearch, parseNoteSearch, validateNoteSearch } from "../noteSearch";

// The notes of a notebook in a grid (pagination, sorting, filtering on the server, state in the URL); a note opens in the editor
// (notes.$notebookId.$noteId.tsx), which keeps the grid state for its back link
export const Route = createFileRoute("/_app/notes/$notebookId/")({
    validateSearch: validateNoteSearch,
    loaderDeps: ({ search }) => search,
    loader: async ({ params: { notebookId }, deps }) => {
        const result = await listNotes({ data: { notebookId, ...deps } });

        // e.g. after deleting the last note of the last page
        const { page, pageSize } = parseNoteSearch(deps);
        if (result.notes.length === 0 && page > 0) {
            throw redirect({
                to: "/notes/$notebookId",
                params: { notebookId },
                search: { ...deps, page: Math.max(0, Math.ceil(result.totalCount / pageSize) - 1) || undefined },
            });
        }

        return result;
    },
    head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.notebook.name} – ${appName}` : appName }] }),
    component: NotebookPage,
});

const LinkCell = createLink(MuiLink);

function NotebookPage() {
    const { notebook, notes, totalCount } = Route.useLoaderData();
    const notebooks = useNotebooks();
    const navigate = Route.useNavigate();
    const router = useRouter();
    const updateNoteFn = useServerFn(updateNote);
    const deleteNoteFn = useServerFn(deleteNote);
    const showError = useShowError();
    const [noteToDelete, setNoteToDelete] = useState<NoteSummary | null>(null);

    // Use the pending location while loading, otherwise the grid would show the old state until the loader is done (e.g. reset a filter value while typing)
    const search = validateNoteSearch(useRouterState({ select: (state) => state.location.search }));
    const isLoading = useRouterState({ select: (state) => state.status === "pending" && state.location.href !== state.resolvedLocation?.href });
    const { page, pageSize, sort, filter, filterItems } = parseNoteSearch(search);
    const sortModel: GridSortModel = sort.map(({ field, direction }) => ({ field, sort: direction }));
    const filterModel: GridFilterModel = {
        items: filterItems.map((item, index) => ({ id: index, ...item })),
        logicOperator: filter.logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And,
    };

    const updateSearch = (values: NoteSearch, { replace = false } = {}) => {
        void navigate({ search: { ...search, ...values }, replace, resetScroll: false });
    };

    const openNote = (noteId: string) => void navigate({ to: "/notes/$notebookId/$noteId", params: { notebookId: notebook.id, noteId }, search });

    const handleMove = async (noteId: string, notebookId: string) => {
        try {
            await updateNoteFn({ data: { id: noteId, notebookId } });
        } catch (error) {
            console.error(error);
            showError("Moving the note failed, please try again.");
        }
        // also the sidebar's note counts
        await router.invalidate();
    };

    const columns: GridColDef<NoteSummary>[] = [
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
                            onClick={() => void handleMove(row.id, otherNotebook.id)}
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
                        onChange={(event) => updateSearch({ page: undefined, q: event.target.value || undefined }, { replace: true })}
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
                        pagination
                        paginationMode="server"
                        sortingMode="server"
                        filterMode="server"
                        rowCount={totalCount}
                        paginationModel={{ page, pageSize }}
                        pageSizeOptions={pageSizeOptions}
                        onPaginationModelChange={(model) => updateSearch({ page: model.page, pageSize: model.pageSize })}
                        sortModel={sortModel}
                        onSortModelChange={(model) => updateSearch({ page: undefined, sort: model.map((item) => `${item.field}:${item.sort}`) })}
                        filterModel={filterModel}
                        onFilterModelChange={(model) =>
                            updateSearch(
                                {
                                    page: undefined,
                                    filter: model.items.map((item) => `${item.field}:${item.operator}:${serializeFilterValue(item.value)}`),
                                    filterLogic: model.logicOperator === GridLogicOperator.Or ? "or" : undefined,
                                },
                                // no history entry per keystroke
                                { replace: true },
                            )
                        }
                        loading={isLoading}
                        // the whole row opens the note (the title is the link for keyboard users)
                        onCellClick={({ field, row }, event) => {
                            // a click on the title link is handled by the link (e.g. ctrl-click opens a new tab)
                            if (field !== "actions" && !(event.target instanceof Element && event.target.closest("a"))) {
                                openNote(row.id);
                            }
                        }}
                        localeText={{ noRowsLabel: search.q || filter.items.length > 0 ? "No notes found." : "No notes yet." }}
                        sx={{ "& .MuiDataGrid-row": { cursor: "pointer" } }}
                    />
                </Paper>
            </Stack>
            <DeleteNoteDialog
                note={noteToDelete}
                onClose={() => setNoteToDelete(null)}
                onDelete={async () => {
                    if (noteToDelete) {
                        await deleteNoteFn({ data: { id: noteToDelete.id } });
                        // also the sidebar's note counts
                        await router.invalidate();
                    }
                }}
            />
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
            await navigate({ to: "/notes/$notebookId/$noteId", params: { notebookId, noteId: result.id } });
            // the sidebar's note counts aren't reloaded by the navigation (the layout route's loader data is reused)
            await router.invalidate();
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
