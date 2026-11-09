import { Add, Delete, Edit, Move, Warning } from "@dextinity/admin-icons";
import {
    Box,
    Button,
    Checkbox,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
    DataGridPro,
    getGridBooleanOperators,
    getGridDateOperators,
    getGridStringOperators,
    GridActionsCellItem,
    type GridColDef,
    type GridFilterModel,
    GridLogicOperator,
    type GridSortModel,
} from "@mui/x-data-grid-pro";
import { createFileRoute, redirect, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type FormEvent, useState } from "react";

import { appName } from "~/app";
import { useShowError } from "~/components/ErrorSnackbar";
import { NameDialog } from "~/components/NameDialog";
import { fromDateString, toDateString, useToday } from "~/dates";
import { type GridSearch, pageSizeOptions, serializeFilterValue, supportedOperators, validateGridSearch } from "~/gridSearch";

import type { Todo } from "../db/todos.server";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "../limits";
import { deleteList, renameList } from "../lists.functions";
import { useLists } from "../navigation";
import { isOverdue } from "../overdue";
import { createTodo, deleteTodo, listTodos, updateTodo } from "../todos.functions";
import { parseTodoSearch, todoFields } from "../todoSearch";

export const Route = createFileRoute("/_app/lists/$listId")({
    validateSearch: validateGridSearch,
    loaderDeps: ({ search }) => search,
    loader: async ({ params: { listId }, deps }) => {
        const result = await listTodos({ data: { listId, ...deps } });

        // e.g. after deleting the last todo of the last page
        const { page, pageSize } = parseTodoSearch(deps);
        if (result.todos.length === 0 && page > 0) {
            throw redirect({
                to: "/lists/$listId",
                params: { listId },
                search: { ...deps, page: Math.max(0, Math.ceil(result.totalCount / pageSize) - 1) || undefined },
            });
        }

        return result;
    },
    head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.list.name} – ${appName}` : appName }] }),
    component: Todos,
});

function Todos() {
    const { list, todos, totalCount } = Route.useLoaderData();
    const lists = useLists();
    const navigate = Route.useNavigate();
    const router = useRouter();
    const updateTodoFn = useServerFn(updateTodo);
    const deleteTodoFn = useServerFn(deleteTodo);
    const showError = useShowError();
    const today = useToday();

    // Use the pending location while loading, otherwise the grid would show the old state until the loader is done (e.g. reset a filter value while typing)
    const search = validateGridSearch(useRouterState({ select: (state) => state.location.search }));
    const isLoading = useRouterState({ select: (state) => state.status === "pending" && state.location.href !== state.resolvedLocation?.href });
    const { page, pageSize, sort, filter, filterItems } = parseTodoSearch(search);
    const sortModel: GridSortModel = sort.map(({ field, direction }) => ({ field, sort: direction }));
    const filterModel: GridFilterModel = {
        items: filterItems.map((item, index) => ({ id: index, ...item })),
        logicOperator: filter.logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And,
    };

    const updateSearch = (values: GridSearch, { replace = false } = {}) => {
        void navigate({ search: { ...search, ...values }, replace, resetScroll: false });
    };

    const mutate = async (mutation: Promise<unknown>) => {
        try {
            await mutation;
        } catch (error) {
            console.error(error);
            showError("Saving failed, please try again.");
        }
        // also after an error: the grid shows the stored state again (e.g. the done checkbox)
        await router.invalidate();
    };

    const columns: GridColDef<Todo>[] = [
        {
            field: "done",
            headerName: "Done",
            type: "boolean",
            width: 80,
            filterOperators: supportedOperators(getGridBooleanOperators(), todoFields.done.operators),
            renderCell: ({ row }) => (
                <Checkbox
                    checked={row.done}
                    onChange={(event) => void mutate(updateTodoFn({ data: { id: row.id, done: event.target.checked } }))}
                    slotProps={{ input: { "aria-label": `Mark “${row.title}” as ${row.done ? "open" : "done"}` } }}
                />
            ),
        },
        {
            field: "title",
            headerName: "Title",
            flex: 1,
            minWidth: 150,
            editable: true,
            filterOperators: supportedOperators(getGridStringOperators(), todoFields.title.operators),
        },
        {
            field: "description",
            headerName: "Description",
            type: "longText",
            flex: 1.5,
            minWidth: 150,
            editable: true,
            filterOperators: supportedOperators(getGridStringOperators(), todoFields.description.operators),
        },
        {
            field: "dueDate",
            headerName: "Due",
            type: "date",
            width: 150,
            editable: true,
            filterOperators: supportedOperators(getGridDateOperators(), todoFields.dueDate.operators),
            // the grid works with Date values (at local midnight), the todo has a YYYY-MM-DD string
            valueGetter: (value: string | null) => (value ? fromDateString(value) : null),
            valueSetter: (value: Date | null, row) => ({ ...row, dueDate: value && !Number.isNaN(value.getTime()) ? toDateString(value) : null }),
            renderCell: ({ row, formattedValue }) =>
                isOverdue(row, today) ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "error.main", fontWeight: "bold" }}>
                        {/* titleAccess: accessible name and native tooltip */}
                        <Warning fontSize="small" titleAccess="Overdue" />
                        {formattedValue}
                    </Box>
                ) : (
                    formattedValue
                ),
        },
        {
            field: "createdAt",
            headerName: "Created",
            type: "dateTime",
            width: 180,
            filterOperators: supportedOperators(getGridDateOperators(true), todoFields.createdAt.operators),
        },
        {
            field: "actions",
            type: "actions",
            getActions: ({ row }) => [
                <GridActionsCellItem
                    key="delete"
                    icon={<Delete />}
                    label="Delete"
                    onClick={() => void mutate(deleteTodoFn({ data: { id: row.id } }))}
                />,
                ...lists
                    .filter((otherList) => otherList.id !== list.id)
                    .map((otherList) => (
                        <GridActionsCellItem
                            key={`move-${otherList.id}`}
                            icon={<Move />}
                            label={`Move to “${otherList.name}”`}
                            showInMenu
                            onClick={() => void mutate(updateTodoFn({ data: { id: row.id, listId: otherList.id } }))}
                        />
                    )),
            ],
        },
    ];

    return (
        <Container sx={{ py: 4 }}>
            <Stack spacing={2}>
                <ListHeader list={list} />
                <CreateTodoForm key={list.id} listId={list.id} onCreated={() => void router.invalidate()} />
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                        startIcon={<Warning />}
                        color="error"
                        disabled={today === null}
                        onClick={() =>
                            today !== null &&
                            updateSearch({ page: undefined, filter: [`dueDate:before:${today}`, "done:is:false"], filterLogic: undefined })
                        }
                    >
                        Show overdue
                    </Button>
                </Box>
                <Paper>
                    <DataGridPro
                        rows={todos}
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
                                    filter: model.items.map(
                                        (item) =>
                                            `${item.field}:${item.operator}:${serializeFilterValue(item.value, { dateOnly: item.field === "dueDate" })}`,
                                    ),
                                    filterLogic: model.logicOperator === GridLogicOperator.Or ? "or" : undefined,
                                },
                                // no history entry per keystroke
                                { replace: true },
                            )
                        }
                        loading={isLoading}
                        getRowClassName={({ row }) => (isOverdue(row, today) ? "overdue" : "")}
                        sx={{ "& .overdue": { bgcolor: (theme) => alpha(theme.palette.error.main, 0.06) } }}
                        // the grid keeps the old row if saving fails (onProcessRowUpdateError)
                        processRowUpdate={async (newRow, oldRow) => {
                            const title = newRow.title.trim();
                            if (!title) {
                                // a todo needs a title
                                return oldRow;
                            }
                            const changes = {
                                ...(title !== oldRow.title && { title }),
                                ...(newRow.description !== oldRow.description && { description: newRow.description }),
                                ...(newRow.dueDate !== oldRow.dueDate && { dueDate: newRow.dueDate }),
                            };
                            if (Object.keys(changes).length > 0) {
                                await updateTodoFn({ data: { id: newRow.id, ...changes } });
                                void router.invalidate();
                            }
                            return { ...newRow, title };
                        }}
                        onProcessRowUpdateError={(error) => {
                            console.error(error);
                            showError("Saving failed, please try again.");
                        }}
                    />
                </Paper>
            </Stack>
        </Container>
    );
}

function ListHeader({ list }: { list: { id: string; name: string } }) {
    const router = useRouter();
    const navigate = useNavigate();
    const renameListFn = useServerFn(renameList);
    const deleteListFn = useServerFn(deleteList);
    const showError = useShowError();
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleRename = async (name: string) => {
        const result = await renameListFn({ data: { id: list.id, name } });
        if (result.error === null) {
            setRenameDialogOpen(false);
            await router.invalidate();
        }
        return result.error;
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await deleteListFn({ data: { id: list.id } });
            setDeleteDialogOpen(false);
            // redirects to the first remaining list (or creates a new one)
            await navigate({ to: "/lists", replace: true });
            // the sidebar's lists aren't reloaded by the navigation (the layout route's loader data is reused)
            await router.invalidate();
        } catch (error) {
            console.error(error);
            showError("Deleting the list failed, please try again.");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h5" component="h1" sx={{ flexGrow: 1, overflowWrap: "anywhere" }}>
                {list.name}
            </Typography>
            <Tooltip title="Rename list">
                <IconButton onClick={() => setRenameDialogOpen(true)} aria-label="Rename list">
                    <Edit />
                </IconButton>
            </Tooltip>
            <Tooltip title="Delete list">
                <IconButton onClick={() => setDeleteDialogOpen(true)} aria-label="Delete list">
                    <Delete />
                </IconButton>
            </Tooltip>
            <NameDialog
                open={renameDialogOpen}
                title="Rename list"
                submitLabel="Rename"
                initialName={list.name}
                maxLength={maxListNameLength}
                onClose={() => setRenameDialogOpen(false)}
                onSubmit={handleRename}
            />
            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>Delete list?</DialogTitle>
                <DialogContent>
                    <DialogContentText>“{list.name}” and all its todos will be deleted.</DialogContentText>
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

function CreateTodoForm({ listId, onCreated }: { listId: string; onCreated: () => void }) {
    const createTodoFn = useServerFn(createTodo);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        setPending(true);
        try {
            const result = await createTodoFn({
                data: {
                    listId,
                    title: String(formData.get("title") ?? ""),
                    description: String(formData.get("description") ?? ""),
                    dueDate: String(formData.get("dueDate") ?? "") || null,
                },
            });
            setError(result.error);
            if (result.error === null) {
                form.reset();
                onCreated();
            }
        } catch (error) {
            console.error(error);
            setError("Saving failed, please try again.");
        } finally {
            setPending(false);
        }
    };

    return (
        <Paper component="form" onSubmit={(event: FormEvent<HTMLFormElement>) => void handleSubmit(event)} sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Box sx={{ display: "flex", gap: 1, flexWrap: { xs: "wrap", sm: "nowrap" } }}>
                    <TextField
                        name="title"
                        label="New todo"
                        size="small"
                        fullWidth
                        error={!!error}
                        helperText={error}
                        slotProps={{ htmlInput: { maxLength: maxTodoTitleLength } }}
                    />
                    <TextField
                        name="dueDate"
                        label="Due"
                        type="date"
                        size="small"
                        sx={{ width: 180, flexShrink: 0 }}
                        slotProps={{ inputLabel: { shrink: true } }}
                    />
                    <Button type="submit" variant="contained" startIcon={<Add />} disabled={pending} sx={{ flexShrink: 0, alignSelf: "flex-start" }}>
                        Add
                    </Button>
                </Box>
                <TextField
                    name="description"
                    label="Description (optional)"
                    size="small"
                    multiline
                    minRows={1}
                    fullWidth
                    slotProps={{ htmlInput: { maxLength: maxTodoDescriptionLength } }}
                />
            </Stack>
        </Paper>
    );
}
