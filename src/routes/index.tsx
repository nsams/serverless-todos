import { Add, Delete, Logout } from "@dextinity/admin-icons";
import { AppBar, Box, Button, Checkbox, Container, IconButton, Paper, Stack, TextField, Toolbar, Typography } from "@mui/material";
import {
    DataGridPro,
    getGridBooleanOperators,
    getGridDateOperators,
    getGridStringOperators,
    GridActionsCellItem,
    type GridColDef,
    type GridFilterModel,
    type GridFilterOperator,
    GridLogicOperator,
    type GridSortModel,
} from "@mui/x-data-grid-pro";
import { createFileRoute, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type FormEvent, useState } from "react";

import type { Todo, TodoFilter } from "~/db/todos.server";
import { createTodo, deleteTodo, listTodos, updateTodo } from "~/todos.functions";
import { filterOperators, pageSizeOptions, parseTodoSearch, type TodoSearch, validateTodoSearch } from "~/todoSearch";

export const Route = createFileRoute("/")({
    validateSearch: validateTodoSearch,
    loaderDeps: ({ search }) => search,
    loader: async ({ deps }) => {
        const result = await listTodos({ data: deps });

        // e.g. after deleting the last todo of the last page
        const { page, pageSize } = parseTodoSearch(deps);
        if (result.todos.length === 0 && page > 0) {
            throw redirect({ to: "/", search: { ...deps, page: Math.max(0, Math.ceil(result.totalCount / pageSize) - 1) || undefined } });
        }

        return result;
    },
    component: Todos,
});

function supportedOperators(field: TodoFilter["field"], operators: GridFilterOperator[]) {
    return operators.filter((operator) => (filterOperators[field] as string[]).includes(operator.value));
}

function serializeFilterValue(value: unknown) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? "" : value.toISOString();
    }
    return value == null ? "" : String(value);
}

function Todos() {
    const { user, todos, totalCount } = Route.useLoaderData();
    const navigate = Route.useNavigate();
    const router = useRouter();
    const updateTodoFn = useServerFn(updateTodo);
    const deleteTodoFn = useServerFn(deleteTodo);

    // Use the pending location while loading, otherwise the grid would show the old state until the loader is done (e.g. reset a filter value while typing)
    const search = validateTodoSearch(useRouterState({ select: (state) => state.location.search }));
    const isLoading = useRouterState({ select: (state) => state.status === "pending" && state.location.href !== state.resolvedLocation?.href });
    const { page, pageSize, sort, filter, filterItems } = parseTodoSearch(search);
    const sortModel: GridSortModel = sort.map(({ field, direction }) => ({ field, sort: direction }));
    const filterModel: GridFilterModel = {
        items: filterItems.map((item, index) => ({ id: index, ...item })),
        logicOperator: filter.logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And,
    };

    const updateSearch = (values: TodoSearch, { replace = false } = {}) => {
        void navigate({ search: { ...search, ...values }, replace, resetScroll: false });
    };

    const mutate = async (mutation: Promise<unknown>) => {
        await mutation;
        await router.invalidate();
    };

    const columns: GridColDef<Todo>[] = [
        {
            field: "done",
            headerName: "Done",
            type: "boolean",
            width: 80,
            filterOperators: supportedOperators("done", getGridBooleanOperators()),
            renderCell: ({ row }) => (
                <Checkbox checked={row.done} onChange={(event) => void mutate(updateTodoFn({ data: { id: row.id, done: event.target.checked } }))} />
            ),
        },
        { field: "title", headerName: "Title", flex: 1, editable: true, filterOperators: supportedOperators("title", getGridStringOperators()) },
        {
            field: "createdAt",
            headerName: "Created",
            type: "dateTime",
            width: 200,
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
                    onClick={() => void mutate(deleteTodoFn({ data: { id: row.id } }))}
                />,
            ],
        },
    ];

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Todos
                    </Typography>
                    <Typography sx={{ mr: 1 }}>{user.email}</Typography>
                    {/* handled by Cloudflare Access, so a full page load */}
                    <IconButton href="/cdn-cgi/access/logout" color="inherit" aria-label="Logout">
                        <Logout />
                    </IconButton>
                </Toolbar>
            </AppBar>
            <Container sx={{ py: 4 }}>
                <Stack spacing={2}>
                    <CreateTodoForm onCreated={() => void router.invalidate()} />
                    <Paper>
                        <DataGridPro
                            rows={todos}
                            columns={columns}
                            autoHeight
                            disableRowSelectionOnClick
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
                            processRowUpdate={(newRow, oldRow) => {
                                if (newRow.title !== oldRow.title) {
                                    void mutate(updateTodoFn({ data: { id: newRow.id, title: newRow.title } }));
                                }
                                return newRow;
                            }}
                        />
                    </Paper>
                </Stack>
            </Container>
        </>
    );
}

function CreateTodoForm({ onCreated }: { onCreated: () => void }) {
    const createTodoFn = useServerFn(createTodo);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        setPending(true);
        try {
            const result = await createTodoFn({ data: { title: String(new FormData(form).get("title") ?? "") } });
            setError(result.error);
            if (result.error === null) {
                form.reset();
                onCreated();
            }
        } finally {
            setPending(false);
        }
    };

    return (
        <form onSubmit={(event) => void handleSubmit(event)}>
            <Box sx={{ display: "flex", gap: 1 }}>
                <TextField name="title" label="New todo" size="small" fullWidth error={!!error} helperText={error} />
                <Button type="submit" variant="contained" startIcon={<Add />} disabled={pending}>
                    Add
                </Button>
            </Box>
        </form>
    );
}
