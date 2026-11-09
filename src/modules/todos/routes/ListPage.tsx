import { Add, Delete, Move, Warning } from "@dextinity/admin-icons";
import { Box, Button, Checkbox, Container, Paper, Stack, TextField } from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
    DataGridPro,
    getGridBooleanOperators,
    getGridDateOperators,
    getGridStringOperators,
    GridActionsCellItem,
    type GridColDef,
} from "@mui/x-data-grid-pro";
import { type InferRequestType, parseResponse } from "hono/client";
import { type FormEvent, useState } from "react";
import { generatePath, type LoaderFunctionArgs, replace, useLoaderData, useNavigate, useRevalidator } from "react-router";

import { api, loadResponse } from "~/api/client";
import { pathParam } from "~/client/params";
import { CollectionHeader } from "~/components/CollectionHeader";
import { useShowError } from "~/components/ErrorSnackbar";
import { useDocumentTitle } from "~/components/useDocumentTitle";
import { useMutate } from "~/components/useMutate";
import { useServerGrid } from "~/components/useServerGrid";
import { fromDateString, toDateString, useToday } from "~/dates";
import { lastPageWithRows, supportedOperators, validateGridSearch } from "~/gridSearch";
import { readSearch, stringifySearch, toQuery } from "~/searchParams";

import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "../limits";
import { useLists } from "../navigation";
import { isOverdue } from "../overdue";
import { listPath, listsPath } from "../paths";
import { parseTodoSearch, todoFields } from "../todoSearch";

// The todos of a list in a grid (pagination, sorting, filtering on the server, state in the URL)
export async function listLoader({ params, request }: LoaderFunctionArgs) {
    const listId = pathParam(params, "listId");
    const search = readSearch(new URL(request.url).search, validateGridSearch);
    const result = await loadResponse(api.lists[":listId"].todos.$get({ param: { listId }, query: toQuery(search) }));

    // e.g. after deleting the last todo of the last page
    const lastPage = lastPageWithRows(parseTodoSearch(search), result.todos.length, result.totalCount);
    if (lastPage !== undefined) {
        throw replace(generatePath(listPath, { listId }) + stringifySearch({ ...search, page: lastPage || undefined }));
    }

    return result;
}

type Todo = Awaited<ReturnType<typeof listLoader>>["todos"][number];

export function ListPage() {
    const { list, todos, totalCount } = useLoaderData<typeof listLoader>();
    const lists = useLists();
    const { revalidate } = useRevalidator();
    const showError = useShowError();
    const mutate = useMutate();
    const today = useToday();
    const { updateSearch, gridProps } = useServerGrid({
        validateSearch: validateGridSearch,
        fields: todoFields,
        rowCount: totalCount,
        dateOnlyFields: ["dueDate"],
    });
    useDocumentTitle(list.name);

    const updateTodo = (todoId: string, changes: InferRequestType<(typeof api.todos)[":todoId"]["$patch"]>["json"]) =>
        parseResponse(api.todos[":todoId"].$patch({ param: { todoId }, json: changes }));

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
                    onChange={(event) => void mutate(updateTodo(row.id, { done: event.target.checked }))}
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
            // an ISO string in the API's JSON
            valueGetter: (value: string) => new Date(value),
        },
        {
            field: "actions",
            type: "actions",
            getActions: ({ row }) => [
                <GridActionsCellItem
                    key="delete"
                    icon={<Delete />}
                    label="Delete"
                    onClick={() => void mutate(parseResponse(api.todos[":todoId"].$delete({ param: { todoId: row.id } })))}
                />,
                ...lists
                    .filter((otherList) => otherList.id !== list.id)
                    .map((otherList) => (
                        <GridActionsCellItem
                            key={`move-${otherList.id}`}
                            icon={<Move />}
                            label={`Move to “${otherList.name}”`}
                            showInMenu
                            onClick={() => void mutate(updateTodo(row.id, { listId: otherList.id }))}
                        />
                    )),
            ],
        },
    ];

    return (
        <Container sx={{ py: 4 }}>
            <Stack spacing={2}>
                <ListHeader list={list} />
                <CreateTodoForm key={list.id} listId={list.id} onCreated={() => void revalidate()} />
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                        startIcon={<Warning />}
                        color="error"
                        onClick={() => updateSearch({ filter: [`dueDate:before:${today}`, "done:is:false"], filterLogic: undefined })}
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
                        {...gridProps}
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
                                await updateTodo(newRow.id, changes);
                                void revalidate();
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
    const { revalidate } = useRevalidator();
    const navigate = useNavigate();

    return (
        <CollectionHeader
            name={list.name}
            kind="list"
            deleteText={`“${list.name}” and all its todos will be deleted.`}
            maxNameLength={maxListNameLength}
            onRename={async (name) => {
                const response = await api.lists[":listId"].$patch({ param: { listId: list.id }, json: { name } });
                if (response.status === 422) {
                    return (await response.json()).error;
                }
                await parseResponse(response);
                await revalidate();
                return null;
            }}
            onDelete={async () => {
                await parseResponse(api.lists[":listId"].$delete({ param: { listId: list.id } }));
                // redirects to the first remaining list (or creates a new one)
                await navigate(listsPath, { replace: true });
                // the sidebar's lists aren't reloaded by the navigation (the app layout's loader data is reused)
                await revalidate();
            }}
        />
    );
}

function CreateTodoForm({ listId, onCreated }: { listId: string; onCreated: () => void }) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        setPending(true);
        try {
            const response = await api.lists[":listId"].todos.$post({
                param: { listId },
                json: {
                    title: String(formData.get("title") ?? ""),
                    description: String(formData.get("description") ?? ""),
                    dueDate: String(formData.get("dueDate") ?? "") || null,
                },
            });
            if (response.status === 422) {
                setError((await response.json()).error);
                return;
            }
            await parseResponse(response);
            setError(null);
            form.reset();
            onCreated();
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
