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
} from "@mui/x-data-grid-pro";
import { useEffect, useRef, useState } from "react";
import { data, Form, redirect, useFetcher, useSearchParams, useSubmit } from "react-router";

import { requireUser } from "~/auth.server";
import { getTodoRepository, type Todo, type TodoFilter } from "~/db/todos.server";
import { filterModelToSearchParams, filterOperators, pageSizeOptions, parseGridState } from "~/todosGridState";

import type { Route } from "./+types/todos";
import type { loader as listLoader } from "./todos.list";

// Initial grid data for server rendering. The filter isn't part of the URL, it starts empty on every page load.
export async function loader({ request, url }: Route.LoaderArgs) {
    const user = await requireUser(request);
    const { page, pageSize, sort } = parseGridState(url.searchParams);

    const { rows, totalCount } = await getTodoRepository().list(user.id, {
        offset: page * pageSize,
        limit: pageSize,
        sort,
        filter: { items: [], logicOperator: "and" },
    });

    // e.g. after deleting the last todo of the last page and reloading
    if (rows.length === 0 && page > 0) {
        url.searchParams.set("page", String(Math.max(0, Math.ceil(totalCount / pageSize) - 1)));
        throw redirect(`${url.pathname}${url.search}`);
    }

    return { user, rows, totalCount };
}

// Afterwards the grid data is (re)loaded by the list fetcher (incl. revalidation after actions), the user doesn't change
export function shouldRevalidate() {
    return false;
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

export default function Todos({ loaderData }: Route.ComponentProps) {
    const { user } = loaderData;
    const submit = useSubmit();
    const [searchParams, setSearchParams] = useSearchParams();
    const { page, pageSize, sortModel } = parseGridState(searchParams);
    const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });

    const { load: loadList, ...listFetcher } = useFetcher<typeof listLoader>();
    const listSearchParams = new URLSearchParams([...searchParams, ...filterModelToSearchParams(filterModel)]);
    const listUrl = `/todos/list?${listSearchParams}`;
    useEffect(() => {
        void loadList(listUrl);
    }, [loadList, listUrl]);
    // Server-rendered data until the fetcher has loaded
    const { rows, totalCount } = listFetcher.data ?? loaderData;

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
                            rows={rows}
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
                            onFilterModelChange={(model) => {
                                setFilterModel(model);
                                if (searchParams.has("page")) {
                                    updateSearchParams({ page: undefined }, { replace: true });
                                }
                            }}
                            loading={listFetcher.state === "loading"}
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
