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
import { useEffect, useRef } from "react";
import { data, Form, redirect, useFetcher, useLocation, useNavigation, useSearchParams, useSubmit } from "react-router";

import { requireUser } from "~/auth.server";
import { getTodoRepository, type Todo, type TodoFilter, type TodoFilterModel, type TodoSort } from "~/db/todos.server";

import type { Route } from "./+types/todos";

const pageSizeOptions = [10, 25, 50];

const filterOperators: { [Field in TodoFilter["field"]]: Extract<TodoFilter, { field: Field }>["operator"][] } = {
    title: ["contains", "equals", "startsWith", "endsWith"],
    done: ["is"],
    createdAt: ["after", "onOrAfter", "before", "onOrBefore"],
};

function isTodoField(field: string | undefined): field is TodoFilter["field"] {
    return field !== undefined && Object.hasOwn(filterOperators, field);
}

// Grid state (pagination, sorting, filtering) lives in the URL, parsed the same way on server and client:
// ?page=0&pageSize=25&sort=title:asc&sort=done:desc&filter=title:contains:milk&filter=done:is:false&filterLogic=or
function parseGridState(searchParams: URLSearchParams) {
    const page = Math.max(0, Number.parseInt(searchParams.get("page") ?? "", 10) || 0);
    const requestedPageSize = Number(searchParams.get("pageSize"));
    const pageSize = pageSizeOptions.includes(requestedPageSize) ? requestedPageSize : 25;

    const sort: TodoSort[] = [];
    for (const param of searchParams.getAll("sort")) {
        const [field, direction] = param.split(":");
        if (isTodoField(field) && (direction === "asc" || direction === "desc") && !sort.some((item) => item.field === field)) {
            sort.push({ field, direction });
        }
    }
    const sortModel: GridSortModel = sort.map(({ field, direction }) => ({ field, sort: direction }));

    const logicOperator = searchParams.get("filterLogic") === "or" ? "or" : "and";
    const filter: TodoFilterModel = { items: [], logicOperator };
    const filterModel: GridFilterModel = { items: [], logicOperator: logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And };
    for (const param of searchParams.getAll("filter")) {
        const [field, operator = "", ...rest] = param.split(":");
        const rawValue = rest.join(":");
        if (!isTodoField(field) || !(filterOperators[field] as string[]).includes(operator)) {
            continue;
        }
        // Items without a value are kept for the filter panel, but don't filter
        filterModel.items.push({ id: filterModel.items.length, field, operator, value: rawValue || undefined });
        const value = field === "done" ? rawValue === "true" : field === "createdAt" ? new Date(rawValue) : rawValue;
        if (rawValue && !(value instanceof Date && Number.isNaN(value.getTime()))) {
            filter.items.push({ field, operator, value } as TodoFilter);
        }
    }

    return { page, pageSize, sort, sortModel, filter, filterModel };
}

export async function loader({ request, url }: Route.LoaderArgs) {
    const user = await requireUser(request);
    const { page, pageSize, sort, filter } = parseGridState(url.searchParams);

    const { rows, totalCount } = await getTodoRepository().list(user.id, { offset: page * pageSize, limit: pageSize, sort, filter });

    // e.g. after deleting the last todo of the last page
    if (rows.length === 0 && page > 0) {
        url.searchParams.set("page", String(Math.max(0, Math.ceil(totalCount / pageSize) - 1)));
        throw redirect(`${url.pathname}${url.search}`);
    }

    return { user, todos: rows, totalCount };
}

export async function action({ request }: Route.ActionArgs) {
    const user = await requireUser(request);
    const formData = await request.formData();
    const repository = getTodoRepository();
    const id = String(formData.get("id"));

    switch (formData.get("intent")) {
        case "create": {
            const title = String(formData.get("title") ?? "").trim();
            if (!title) {
                return data({ error: "Title is required" }, { status: 400 });
            }
            await repository.create(user.id, title);
            return { error: null };
        }
        case "update": {
            const title = formData.get("title");
            const done = formData.get("done");
            await repository.update(user.id, id, {
                ...(title !== null && { title: String(title) }),
                ...(done !== null && { done: done === "true" }),
            });
            return { error: null };
        }
        case "delete":
            await repository.delete(user.id, id);
            return { error: null };
        default:
            throw data("Unknown intent", { status: 400 });
    }
}

function supportedOperators(field: TodoFilter["field"], operators: GridFilterOperator[]) {
    return operators.filter((operator) => (filterOperators[field] as string[]).includes(operator.value));
}

function serializeFilterValue(value: unknown) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? "" : value.toISOString();
    }
    return value == null ? "" : String(value);
}

export default function Todos({ loaderData }: Route.ComponentProps) {
    const { user, todos, totalCount } = loaderData;
    const submit = useSubmit();
    const location = useLocation();
    const navigation = useNavigation();
    const [, setSearchParams] = useSearchParams();

    // Use the pending location while loading, otherwise the grid would show the old state until the loader is done (e.g. reset a filter value while typing)
    const searchParams = new URLSearchParams((navigation.location?.pathname === location.pathname ? navigation.location : location).search);
    const { page, pageSize, sortModel, filterModel } = parseGridState(searchParams);

    const updateSearchParams = (values: Record<string, string | string[] | undefined>, { replace = false } = {}) => {
        const nextSearchParams = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(values)) {
            nextSearchParams.delete(key);
            for (const item of [value ?? []].flat()) {
                nextSearchParams.append(key, item);
            }
        }
        setSearchParams(nextSearchParams, { preventScrollReset: true, replace });
    };

    const updateTodo = (id: string, values: Partial<Pick<Todo, "title" | "done">>) => {
        void submit({ intent: "update", id, ...values }, { method: "post", navigate: false });
    };

    const columns: GridColDef<Todo>[] = [
        {
            field: "done",
            headerName: "Done",
            type: "boolean",
            width: 80,
            filterOperators: supportedOperators("done", getGridBooleanOperators()),
            renderCell: ({ row }) => <Checkbox checked={row.done} onChange={(event) => updateTodo(row.id, { done: event.target.checked })} />,
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
                    onClick={() => void submit({ intent: "delete", id: row.id }, { method: "post", navigate: false })}
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
                    <Typography sx={{ mr: 1 }}>{user.name}</Typography>
                    <Form method="post" action="/logout">
                        <IconButton type="submit" color="inherit" aria-label="Logout">
                            <Logout />
                        </IconButton>
                    </Form>
                </Toolbar>
            </AppBar>
            <Container sx={{ py: 4 }}>
                <Stack spacing={2}>
                    <CreateTodoForm />
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
                            onPaginationModelChange={(model) => updateSearchParams({ page: String(model.page), pageSize: String(model.pageSize) })}
                            sortModel={sortModel}
                            onSortModelChange={(model) =>
                                updateSearchParams({ page: undefined, sort: model.map((item) => `${item.field}:${item.sort}`) })
                            }
                            filterModel={filterModel}
                            onFilterModelChange={(model) =>
                                updateSearchParams(
                                    {
                                        page: undefined,
                                        filter: model.items.map((item) => `${item.field}:${item.operator}:${serializeFilterValue(item.value)}`),
                                        filterLogic: model.logicOperator === GridLogicOperator.Or ? "or" : undefined,
                                    },
                                    // no history entry per keystroke
                                    { replace: true },
                                )
                            }
                            loading={navigation.state === "loading"}
                            processRowUpdate={(newRow, oldRow) => {
                                if (newRow.title !== oldRow.title) {
                                    updateTodo(newRow.id, { title: newRow.title });
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

function CreateTodoForm() {
    const fetcher = useFetcher<typeof action>();
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data?.error === null) {
            formRef.current?.reset();
        }
    }, [fetcher.state, fetcher.data]);

    return (
        <fetcher.Form method="post" ref={formRef}>
            <input type="hidden" name="intent" value="create" />
            <Box sx={{ display: "flex", gap: 1 }}>
                <TextField name="title" label="New todo" size="small" fullWidth error={!!fetcher.data?.error} helperText={fetcher.data?.error} />
                <Button type="submit" variant="contained" startIcon={<Add />} disabled={fetcher.state !== "idle"}>
                    Add
                </Button>
            </Box>
        </fetcher.Form>
    );
}
