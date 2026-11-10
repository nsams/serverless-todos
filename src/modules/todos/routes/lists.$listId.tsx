import { Add, Delete, Move, Warning } from "@dextinity/admin-icons";
import { Box, Button, Checkbox, Container, Paper, Stack, TextField } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { DataGridPro, getGridBooleanOperators, getGridDateOperators, getGridStringOperators, GridActionsCellItem } from "@mui/x-data-grid-pro";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, linkOptions } from "@tanstack/react-router";
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

import { todosApi, type TodosApiInputs } from "../api";
import { todosChatPage } from "../chatPage";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "../limits";
import { todosModuleId } from "../moduleId";
import type { TodoView } from "../operations.server";
import { isOverdue } from "../overdue";
import { todoFields } from "../todoSearch";

export const Route = createFileRoute("/_app/lists/$listId")({
    validateSearch: validateGridSearch,
    loaderDeps: ({ search }) => search,
    loader: async ({ context: { queryClient }, params: { listId }, deps }) => {
        const { list } = await loadPageQuery(queryClient, todosApi.listTodos.queryOptions({ ...deps, listId }));
        return { title: list.name };
    },
    head: ({ loaderData }) => pageHead(loaderData?.title),
    component: Todos,
});

function Todos() {
    const { listId } = Route.useParams();
    const { list, todos, totalCount } = usePageQuery(todosApi.listTodos.queryOptions({ ...Route.useSearch(), listId }));
    // for the "move to" menu: empty while loading, the page doesn't wait for them
    const lists = useQuery(todosApi.listLists.queryOptions({})).data ?? [];
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
                    onChange={(event) => void mutate(todosApi.updateTodo.mutate({ id: row.id, done: event.target.checked }))}
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
                    onClick={() => void mutate(todosApi.deleteTodo.mutate({ id: row.id }))}
                />,
                ...lists
                    .filter((otherList) => otherList.id !== list.id)
                    .map((otherList) => (
                        <GridActionsCellItem
                            key={`move-${otherList.id}`}
                            icon={<Move />}
                            label={`Move to “${otherList.name}”`}
                            showInMenu
                            onClick={() => void mutate(todosApi.updateTodo.mutate({ id: row.id, listId: otherList.id }))}
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
                                id: newRow.id,
                                title: title !== oldRow.title ? title : undefined,
                                description: newRow.description !== oldRow.description ? newRow.description : undefined,
                                dueDate: newRow.dueDate !== oldRow.dueDate ? newRow.dueDate : undefined,
                            } satisfies TodosApiInputs["updateTodo"];
                            if (changes.title !== undefined || changes.description !== undefined || changes.dueDate !== undefined) {
                                await todosApi.updateTodo.mutate(changes);
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
        rename: (name) => todosApi.renameList.mutate({ listId: list.id, name }),
        delete: () => todosApi.deleteList.mutate({ listId: list.id }),
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
            await todosApi.createTodo.mutate({
                listId,
                title: String(formData.get("title") ?? ""),
                description: String(formData.get("description") ?? ""),
                dueDate: String(formData.get("dueDate") ?? "") || null,
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
