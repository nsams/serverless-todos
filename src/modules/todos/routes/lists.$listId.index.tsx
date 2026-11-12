import { Add, Delete, Edit, Move, Warning } from "@dextinity/admin-icons";
import { Box, Button, Checkbox, Container, Paper, Stack, TextField } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { DataGridPro, getGridBooleanOperators, getGridDateOperators, getGridStringOperators, GridActionsCellItem } from "@mui/x-data-grid-pro";
import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { type InferRequestType, parseResponse } from "hono/client";
import { type FormEvent, useState } from "react";

import { pageHead } from "~/app";
import { useChatPage } from "~/chat/useChatPage";
import { useCollectionHeaderActions } from "~/collections";
import { CollectionHeader } from "~/components/CollectionHeader";
import { useShowError } from "~/components/ErrorSnackbar";
import { useMutate } from "~/components/useMutate";
import { useServerGrid } from "~/components/useServerGrid";
import { fromDateString, toDateString, useToday } from "~/dates";
import { errorMessage } from "~/errors";
import { filterParam, type GridColumns, supportedOperators, validateGridSearch } from "~/gridSearch";
import { loadPageQuery, useInvalidateModule, usePageQuery } from "~/moduleQueries";

import { todosClient } from "../api";
import { todosChatPage } from "../chatPage";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "../limits";
import { todosModuleId } from "../moduleId";
import { isOverdue } from "../overdue";
import { type Todo, todosQuery, useLists } from "../queries";
import { todoFields } from "../todoSearch";

export const Route = createFileRoute("/_app/lists/$listId/")({
    validateSearch: validateGridSearch,
    loaderDeps: ({ search }) => search,
    loader: async ({ context: { queryClient }, params: { listId }, deps }) => {
        const { list } = await loadPageQuery(queryClient, todosQuery({ listId, ...deps }));
        return { title: list.name };
    },
    head: ({ loaderData }) => pageHead(loaderData?.title),
    component: Todos,
});

// The changes of a todo: the JSON body of its route, typed by the operation's input (a renamed field breaks the build)
type TodoChanges = InferRequestType<(typeof todosClient.todos)[":id"]["$patch"]>["json"];

function Todos() {
    const { listId } = Route.useParams();
    const { list, todos, totalCount } = usePageQuery(todosQuery({ ...Route.useSearch(), listId }));
    const lists = useLists();
    const navigate = Route.useNavigate();
    const invalidate = useInvalidateModule(todosModuleId);
    const showError = useShowError();
    const mutate = useMutate(todosModuleId);
    const today = useToday();
    const { updateSearch, gridProps } = useServerGrid({
        validateSearch: validateGridSearch,
        fields: todoFields,
        navigate: (search, { replace }) => void navigate({ search, replace, resetScroll: false }),
        rows: todos,
        rowCount: totalCount,
        dateOnlyFields: ["dueDate"],
    });

    // what the assistant gets to know about the page
    useChatPage(todosChatPage, { listId: list.id });

    const updateTodo = (id: string, changes: TodoChanges) => parseResponse(todosClient.todos[":id"].$patch({ param: { id }, json: changes }));

    const columns: GridColumns<Todo, typeof todoFields> = [
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
                    key="edit"
                    icon={<Edit />}
                    label="Edit"
                    // the detail page keeps the grid's state for its back link
                    onClick={() =>
                        void navigate({ to: "/lists/$listId/$todoId", params: { listId: list.id, todoId: row.id }, search: (search) => search })
                    }
                />,
                <GridActionsCellItem
                    key="delete"
                    icon={<Delete />}
                    label="Delete"
                    onClick={() => void mutate(parseResponse(todosClient.todos[":id"].$delete({ param: { id: row.id } })))}
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
                <CreateTodoForm key={list.id} listId={list.id} onCreated={() => void invalidate()} />
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                        startIcon={<Warning />}
                        color="error"
                        onClick={() =>
                            updateSearch({
                                filter: [filterParam(todoFields, "dueDate", "before", today), filterParam(todoFields, "done", "is", "false")],
                                filterLogic: undefined,
                            })
                        }
                    >
                        Show overdue
                    </Button>
                </Box>
                <Paper>
                    <DataGridPro
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
                            // the changed fields, undefined: unchanged (typed by the operation: a renamed field breaks the build)
                            const changes = {
                                title: title !== oldRow.title ? title : undefined,
                                description: newRow.description !== oldRow.description ? newRow.description : undefined,
                                dueDate: newRow.dueDate !== oldRow.dueDate ? newRow.dueDate : undefined,
                            } satisfies TodoChanges;
                            if (changes.title !== undefined || changes.description !== undefined || changes.dueDate !== undefined) {
                                await updateTodo(newRow.id, changes);
                                void invalidate();
                            }
                            return { ...newRow, title };
                        }}
                        onProcessRowUpdateError={(error) => showError(errorMessage(error))}
                    />
                </Paper>
            </Stack>
        </Container>
    );
}

function ListHeader({ list }: { list: { id: string; name: string } }) {
    const actions = useCollectionHeaderActions(todosModuleId, {
        rename: (name) => parseResponse(todosClient.lists[":listId"].$patch({ param: { listId: list.id }, json: { name } })),
        delete: () => parseResponse(todosClient.lists[":listId"].$delete({ param: { listId: list.id } })),
        // redirects to the first remaining list (or creates a new one)
        index: linkOptions({ to: "/lists" }),
    });

    return (
        <CollectionHeader
            name={list.name}
            kind="list"
            deleteText={`“${list.name}” and all its todos will be deleted.`}
            maxNameLength={maxListNameLength}
            {...actions}
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
            await parseResponse(
                todosClient.lists[":listId"].todos.$post({
                    param: { listId },
                    json: {
                        title: String(formData.get("title") ?? ""),
                        description: String(formData.get("description") ?? ""),
                        dueDate: String(formData.get("dueDate") ?? "") || null,
                    },
                }),
            );
            setError(null);
            form.reset();
            onCreated();
        } catch (error) {
            setError(errorMessage(error));
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
