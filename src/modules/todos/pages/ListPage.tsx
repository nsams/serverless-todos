import { Add, Delete, Move, Warning } from "@dextinity/admin-icons";
import { Box, Button, Checkbox, Container, Paper, Stack, TextField } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { DataGridPro, getGridBooleanOperators, getGridDateOperators, getGridStringOperators, GridActionsCellItem } from "@mui/x-data-grid-pro";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";
import { type FormEvent, useState } from "react";

import { useChatPage } from "~/chat/useChatPage";
import { useInvalidateModule, usePageQuery } from "~/client/queries";
import { CollectionHeader } from "~/components/CollectionHeader";
import { useShowError } from "~/components/ErrorSnackbar";
import { useDocumentTitle } from "~/components/useDocumentTitle";
import { useMutate } from "~/components/useMutate";
import { useServerGrid } from "~/components/useServerGrid";
import { fromDateString, toDateString, useToday } from "~/dates";
import { errorMessage } from "~/errors";
import { type GridColumns, supportedOperators } from "~/gridSearch";

import { todosClient } from "../api";
import { todosChatPage } from "../chatPage";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "../limits";
import { todosModuleId } from "../moduleId";
import { isOverdue } from "../overdue";
import { todosQuery, useLists } from "../queries";
import { listRoute, listsRoute } from "../routes";
import { todoFields } from "../todoSearch";

type Todo = InferResponseType<(typeof todosClient.lists)[":listId"]["todos"]["$get"], 200>["todos"][number];

// The todos of a list in a grid (pagination, sorting, filtering on the server, state in the URL), see listRoute
export default function ListPage() {
    const { listId } = listRoute.useParams();
    const search = listRoute.useSearch();
    const {
        data: { list, todos, totalCount },
        loading,
    } = usePageQuery(todosQuery, { listId, ...search });
    const lists = useLists();
    const invalidate = useInvalidateModule(todosModuleId);
    const showError = useShowError();
    const mutate = useMutate(todosModuleId);
    const today = useToday();
    const { updateSearch, gridProps } = useServerGrid({
        search,
        fields: todoFields,
        rows: todos,
        rowCount: totalCount,
        loading,
        dateOnlyFields: ["dueDate"],
    });
    useDocumentTitle(list.name);
    // what the assistant gets to know about the page
    useChatPage(todosChatPage, { listId: list.id });

    const updateTodo = (id: string, changes: InferRequestType<(typeof todosClient.todos)[":id"]["$patch"]>["json"]) =>
        parseResponse(todosClient.todos[":id"].$patch({ param: { id }, json: changes }));

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
                        onClick={() => updateSearch({ filter: [`dueDate:before:${today}`, "done:is:false"], filterLogic: undefined })}
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
                            // the changed fields, undefined: unchanged (a typed object literal: a renamed field of the API breaks the build)
                            const changes: Parameters<typeof updateTodo>[1] = {
                                title: title !== oldRow.title ? title : undefined,
                                description: newRow.description !== oldRow.description ? newRow.description : undefined,
                                dueDate: newRow.dueDate !== oldRow.dueDate ? newRow.dueDate : undefined,
                            };
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
    return (
        <CollectionHeader
            moduleId={todosModuleId}
            name={list.name}
            kind="list"
            deleteText={`“${list.name}” and all its todos will be deleted.`}
            maxNameLength={maxListNameLength}
            onRename={(name) => parseResponse(todosClient.lists[":listId"].$patch({ param: { listId: list.id }, json: { name } }))}
            onDelete={async () => {
                await parseResponse(todosClient.lists[":listId"].$delete({ param: { listId: list.id } }));
                // redirects to the first remaining list (or creates a new one)
                return listsRoute.href();
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
