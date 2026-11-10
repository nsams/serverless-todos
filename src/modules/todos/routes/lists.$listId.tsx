import { Add, Delete, Move, Warning } from "@dextinity/admin-icons";
import { Box, Button, Checkbox, Container, Paper, Stack, TextField } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { DataGridPro, getGridBooleanOperators, getGridDateOperators, getGridStringOperators, GridActionsCellItem } from "@mui/x-data-grid-pro";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type FormEvent, useState } from "react";

import { appName } from "~/app";
import { useChatPage } from "~/chat/useChatPage";
import { CollectionHeader } from "~/components/CollectionHeader";
import { useShowError } from "~/components/ErrorSnackbar";
import { useMutate } from "~/components/useMutate";
import { useServerGrid } from "~/components/useServerGrid";
import { fromDateString, toDateString, useToday } from "~/dates";
import { errorMessage } from "~/errors";
import { type GridColumns, lastPageWithRows, supportedOperators, validateGridSearch } from "~/gridSearch";

import { todosChatPage } from "../chatPage";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "../limits";
import { deleteList, renameList } from "../lists.functions";
import { useLists } from "../navigation";
import type { TodoView } from "../operations.server";
import { isOverdue } from "../overdue";
import { createTodo, deleteTodo, listTodos, updateTodo } from "../todos.functions";
import { parseTodoSearch, todoFields } from "../todoSearch";

export const Route = createFileRoute("/_app/lists/$listId")({
    validateSearch: validateGridSearch,
    loaderDeps: ({ search }) => search,
    loader: async ({ params: { listId }, deps }) => {
        const result = await listTodos({ data: { listId, ...deps } });

        // e.g. after deleting the last todo of the last page
        const lastPage = lastPageWithRows(parseTodoSearch(deps), result.todos.length, result.totalCount);
        if (lastPage !== undefined) {
            throw redirect({ to: "/lists/$listId", params: { listId }, search: { ...deps, page: lastPage || undefined } });
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
    const mutate = useMutate();
    const today = useToday();
    const { updateSearch, gridProps } = useServerGrid({
        validateSearch: validateGridSearch,
        fields: todoFields,
        navigate: (search, { replace }) => void navigate({ search, replace, resetScroll: false }),
        rowCount: totalCount,
        dateOnlyFields: ["dueDate"],
    });

    // what the assistant gets to know about the page
    useChatPage(todosChatPage, { listId: list.id });

    const columns: GridColumns<TodoView, typeof todoFields> = [
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
                            today !== null && updateSearch({ filter: [`dueDate:before:${today}`, "done:is:false"], filterLogic: undefined })
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
                                await updateTodoFn({ data: { id: newRow.id, ...changes } });
                                void router.invalidate();
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
    const router = useRouter();
    const navigate = useNavigate();
    const renameListFn = useServerFn(renameList);
    const deleteListFn = useServerFn(deleteList);

    return (
        <CollectionHeader
            name={list.name}
            kind="list"
            deleteText={`“${list.name}” and all its todos will be deleted.`}
            maxNameLength={maxListNameLength}
            onRename={async (name) => {
                await renameListFn({ data: { listId: list.id, name } });
                await router.invalidate();
            }}
            onDelete={async () => {
                await deleteListFn({ data: { listId: list.id } });
                // redirects to the first remaining list (or creates a new one)
                await navigate({ to: "/lists", replace: true });
                // the sidebar's lists aren't reloaded by the navigation (the layout route's loader data is reused)
                await router.invalidate();
            }}
        />
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
            await createTodoFn({
                data: {
                    listId,
                    title: String(formData.get("title") ?? ""),
                    description: String(formData.get("description") ?? ""),
                    dueDate: String(formData.get("dueDate") ?? "") || null,
                },
            });
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
