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
    GridEditInputCell,
    type GridFilterModel,
    type GridFilterOperator,
    GridLogicOperator,
    type GridPaginationModel,
    type GridSortModel,
} from "@mui/x-data-grid-pro";
import { createFileRoute, getRouteApi, redirect, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type FormEvent, startTransition, useCallback, useMemo, useOptimistic, useState } from "react";

import { useShowError } from "~/components/ErrorSnackbar";
import { NameDialog } from "~/components/NameDialog";
import { fromDateString, isOverdue, toDateString, useToday } from "~/dates";
import type { Todo, TodoFilter } from "~/db/todos.server";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "~/limits";
import { deleteList, renameList } from "~/lists.functions";
import { createTodo, deleteTodo, listTodos, updateTodo } from "~/todos.functions";
import { filterOperators, pageSizeOptions, parseTodoSearch, type TodoSearch, validateTodoSearch } from "~/todoSearch";

export const Route = createFileRoute("/_app/lists/$listId")({
    validateSearch: validateTodoSearch,
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
    head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.list.name} – Todos` : "Todos" }] }),
    component: Todos,
});

const appRoute = getRouteApi("/_app");

function supportedOperators(field: TodoFilter["field"], operators: GridFilterOperator[]) {
    return operators.filter((operator) => (filterOperators[field] as string[]).includes(operator.value));
}

function serializeFilterValue(field: string, value: unknown) {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return "";
        }
        // the grid's date filter input creates dates at UTC midnight (new Date("YYYY-MM-DD"))
        return field === "dueDate" ? value.toISOString().slice(0, 10) : value.toISOString();
    }
    return value == null ? "" : String(value);
}

// The filter part of the URL (see todoSearch.ts) for a grid filter model
function toFilterSearch(model: GridFilterModel): Pick<TodoSearch, "filter" | "filterLogic"> {
    const filter = model.items.map((item) => `${item.field}:${item.operator}:${serializeFilterValue(item.field, item.value)}`);
    return { filter: filter.length > 0 ? filter : undefined, filterLogic: model.logicOperator === GridLogicOperator.Or ? "or" : undefined };
}

function isSameFilterSearch(a: TodoSearch, b: TodoSearch) {
    return (a.filter ?? []).join("\n") === (b.filter ?? []).join("\n") && a.filterLogic === b.filterLogic;
}

// Too long values are rejected by the server; the cell stays in edit mode and the message is shown
class ValidationError extends Error {}

// Applied until the mutation and the reload are done (or failed)
type OptimisticChange = { id: string; done: boolean } | { id: string; removed: true };

function applyOptimisticChange(todos: Todo[], change: OptimisticChange) {
    if ("removed" in change) {
        return todos.filter((todo) => todo.id !== change.id);
    }
    return todos.map((todo) => (todo.id === change.id ? { ...todo, done: change.done } : todo));
}

function Todos() {
    const { list, todos, totalCount } = Route.useLoaderData();
    // Structural sharing keeps the same array as long as no list was added, renamed or removed (e.g. not when only the open counts change),
    // so the columns aren't recreated (that would reset resized columns)
    const moveTargets = appRoute.useLoaderData({
        select: ({ lists }) => lists.filter((otherList) => otherList.id !== list.id).map(({ id, name }) => ({ id, name })),
        structuralSharing: true,
    });
    const navigate = Route.useNavigate();
    const router = useRouter();
    const updateTodoFn = useServerFn(updateTodo);
    const deleteTodoFn = useServerFn(deleteTodo);
    const showError = useShowError();
    const today = useToday();
    const [optimisticTodos, addOptimisticChange] = useOptimistic(todos, applyOptimisticChange);

    // Use the pending location while loading, otherwise the grid would show the old state until the loader is done (e.g. reset a filter value while typing).
    // The models passed to the grid keep their identity while the URL doesn't change, a new model on every render makes the grid apply it again.
    const rawSearch = useRouterState({ select: (state) => state.location.search, structuralSharing: true });
    const isLoading = useRouterState({ select: (state) => state.status === "pending" && state.location.href !== state.resolvedLocation?.href });
    const search = useMemo(() => validateTodoSearch(rawSearch), [rawSearch]);
    const { page, pageSize, sort, filter, filterItems } = useMemo(() => parseTodoSearch(search), [search]);
    const paginationModel = useMemo<GridPaginationModel>(() => ({ page, pageSize }), [page, pageSize]);
    const sortModel = useMemo<GridSortModel>(() => sort.map(({ field, direction }) => ({ field, sort: direction })), [sort]);
    const urlFilterModel = useMemo<GridFilterModel>(
        () => ({
            items: filterItems.map((item, index) => ({ id: index, ...item })),
            logicOperator: filter.logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And,
        }),
        [filter, filterItems],
    );
    // The grid's own model is passed back while it matches the URL: a model rebuilt from the URL (new item ids, value strings)
    // would reset the filter input the user is typing in
    const [gridFilterModel, setGridFilterModel] = useState<GridFilterModel | null>(null);
    const filterModel = gridFilterModel && isSameFilterSearch(toFilterSearch(gridFilterModel), search) ? gridFilterModel : urlFilterModel;

    const updateSearch = (values: TodoSearch, { replace = false } = {}) => {
        void navigate({ search: { ...search, ...values }, replace, resetScroll: false });
    };

    const mutate = useCallback(
        (change: OptimisticChange, mutation: () => Promise<unknown>) => {
            startTransition(async () => {
                addOptimisticChange(change);
                try {
                    await mutation();
                } catch (error) {
                    console.error(error);
                    showError("Saving failed, please try again.");
                }
                // also after an error: the stored state is shown again when the optimistic change ends with the transition
                await router.invalidate();
            });
        },
        [addOptimisticChange, router, showError],
    );

    const columns = useMemo<GridColDef<Todo>[]>(
        () => [
            {
                field: "done",
                headerName: "Done",
                type: "boolean",
                width: 80,
                filterOperators: supportedOperators("done", getGridBooleanOperators()),
                renderCell: ({ row, tabIndex }) => (
                    <Checkbox
                        checked={row.done}
                        // only the focused cell is a tab stop (grid keyboard navigation)
                        tabIndex={tabIndex}
                        onChange={(event) => {
                            const done = event.target.checked;
                            mutate({ id: row.id, done }, () => updateTodoFn({ data: { id: row.id, done } }));
                        }}
                        // Space toggles the checkbox instead of scrolling the grid by a page
                        onKeyDown={(event) => event.key === " " && event.stopPropagation()}
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
                filterOperators: supportedOperators("title", getGridStringOperators()),
                renderEditCell: (params) => (
                    <GridEditInputCell {...params} slotProps={{ root: { slotProps: { htmlInput: { maxLength: maxTodoTitleLength } } } }} />
                ),
            },
            {
                field: "description",
                headerName: "Description",
                type: "longText",
                flex: 1.5,
                minWidth: 150,
                editable: true,
                filterOperators: supportedOperators("description", getGridStringOperators()),
            },
            {
                field: "dueDate",
                headerName: "Due",
                type: "date",
                width: 150,
                editable: true,
                filterOperators: supportedOperators("dueDate", getGridDateOperators()),
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
                filterOperators: supportedOperators("createdAt", getGridDateOperators(true)),
            },
            {
                field: "actions",
                type: "actions",
                getActions: ({ row }) => [
                    <GridActionsCellItem
                        key="delete"
                        icon={<Delete />}
                        label="Delete"
                        onClick={() => mutate({ id: row.id, removed: true }, () => deleteTodoFn({ data: { id: row.id } }))}
                    />,
                    ...moveTargets.map((otherList) => (
                        <GridActionsCellItem
                            key={`move-${otherList.id}`}
                            icon={<Move />}
                            label={`Move to “${otherList.name}”`}
                            showInMenu
                            onClick={() => mutate({ id: row.id, removed: true }, () => updateTodoFn({ data: { id: row.id, listId: otherList.id } }))}
                        />
                    )),
                ],
            },
        ],
        [moveTargets, today, mutate, updateTodoFn, deleteTodoFn],
    );

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
                        rows={optimisticTodos}
                        columns={columns}
                        autoHeight
                        disableRowSelectionOnClick
                        paginationMode="server"
                        sortingMode="server"
                        filterMode="server"
                        // minus the todos removed optimistically
                        rowCount={totalCount - (todos.length - optimisticTodos.length)}
                        paginationModel={paginationModel}
                        pageSizeOptions={pageSizeOptions}
                        onPaginationModelChange={(model) => updateSearch({ page: model.page, pageSize: model.pageSize })}
                        sortModel={sortModel}
                        onSortModelChange={(model) => updateSearch({ page: undefined, sort: model.map((item) => `${item.field}:${item.sort}`) })}
                        filterModel={filterModel}
                        onFilterModelChange={(model) => {
                            setGridFilterModel(model);
                            // no history entry per keystroke
                            updateSearch({ page: undefined, ...toFilterSearch(model) }, { replace: true });
                        }}
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
                            // the title's edit input has a maxLength, the long text editor doesn't support it
                            if (newRow.description.trim().length > maxTodoDescriptionLength) {
                                throw new ValidationError(`The description can have at most ${maxTodoDescriptionLength} characters.`);
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
                            if (error instanceof ValidationError) {
                                showError(error.message);
                                return;
                            }
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
            // the start page redirects to the first remaining list (or creates a new one)
            await navigate({ to: "/", replace: true });
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
