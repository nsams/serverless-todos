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
import { type FormEvent, useState } from "react";
import { data, href, redirect, useNavigate } from "react-router";

import { appName } from "~/app";
import { CollectionHeader } from "~/components/CollectionHeader";
import { useShowError } from "~/components/ErrorSnackbar";
import { useIntents } from "~/components/useIntents";
import { useMutate } from "~/components/useMutate";
import { useServerGrid } from "~/components/useServerGrid";
import { userContext } from "~/context";
import { fromDateString, toDateString, useToday } from "~/dates";
import { lastPageWithRows, supportedOperators, validateGridSearch } from "~/gridSearch";
import { clientIntentAction, intentAction } from "~/intents";
import { parseSearch, stringifySearch } from "~/searchParams";

import { getListRepository } from "../db/lists.server";
import { getTodoRepository, type Todo } from "../db/todos.server";
import { type ListIntents, listIntents } from "../intents.server";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "../limits";
import { useLists } from "../navigation";
import { isOverdue } from "../overdue";
import { parseTodoSearch, todoFields } from "../todoSearch";
import type { Route } from "./+types/lists.$listId";

// The todos of a list (one page, sorted and filtered as in the URL)
export async function loader({ params: { listId }, url, context }: Route.LoaderArgs) {
    const user = context.get(userContext);
    const list = await getListRepository().get(user.id, listId);
    if (!list) {
        throw data("List not found", { status: 404 });
    }
    const search = validateGridSearch(parseSearch(url.search));
    const { page, pageSize, sort, filter } = parseTodoSearch(search);
    const { rows, totalCount } = await getTodoRepository().list(user.id, listId, { offset: page * pageSize, limit: pageSize, sort, filter });

    // e.g. after deleting the last todo of the last page
    const lastPage = lastPageWithRows({ page, pageSize }, rows.length, totalCount);
    if (lastPage !== undefined) {
        throw redirect(href("/lists/:listId", { listId }) + stringifySearch({ ...search, page: lastPage || undefined }));
    }

    return { list, todos: rows, totalCount };
}

// renames and deletes the list, creates, changes and deletes its todos
export const action = intentAction(listIntents);
export const clientAction = clientIntentAction;

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: loaderData ? `${loaderData.list.name} – ${appName}` : appName }];

export default function Todos({ loaderData: { list, todos, totalCount } }: Route.ComponentProps) {
    const lists = useLists();
    const navigate = useNavigate();
    const { submit } = useIntents<ListIntents>(href("/lists/:listId", { listId: list.id }));
    const showError = useShowError();
    const mutate = useMutate();
    const today = useToday();
    const { updateSearch, gridProps } = useServerGrid({
        validateSearch: validateGridSearch,
        fields: todoFields,
        navigate: (search, { replace }) => void navigate({ search: stringifySearch(search) }, { replace, preventScrollReset: true }),
        rowCount: totalCount,
        dateOnlyFields: ["dueDate"],
    });

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
                    onChange={(event) => void mutate(submit("updateTodo", { id: row.id, done: event.target.checked }))}
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
                    onClick={() => void mutate(submit("deleteTodo", { id: row.id }))}
                />,
                ...lists
                    .filter((otherList) => otherList.id !== list.id)
                    .map((otherList) => (
                        <GridActionsCellItem
                            key={`move-${otherList.id}`}
                            icon={<Move />}
                            label={`Move to “${otherList.name}”`}
                            showInMenu
                            onClick={() => void mutate(submit("updateTodo", { id: row.id, listId: otherList.id }))}
                        />
                    )),
            ],
        },
    ];

    return (
        <Container sx={{ py: 4 }}>
            <Stack spacing={2}>
                <ListHeader list={list} />
                <CreateTodoForm key={list.id} listId={list.id} />
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
                                await submit("updateTodo", { id: newRow.id, ...changes });
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
    const { submit } = useIntents<ListIntents>(href("/lists/:listId", { listId: list.id }));

    return (
        <CollectionHeader
            name={list.name}
            kind="list"
            deleteText={`“${list.name}” and all its todos will be deleted.`}
            maxNameLength={maxListNameLength}
            onRename={async (name) => (await submit("renameList", { name }))?.error ?? null}
            // goes to the first remaining list (or a new one)
            onDelete={async () => {
                await submit("deleteList", {});
            }}
        />
    );
}

function CreateTodoForm({ listId }: { listId: string }) {
    const { submit } = useIntents<ListIntents>(href("/lists/:listId", { listId }));
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        setPending(true);
        try {
            const result = await submit("createTodo", {
                title: String(formData.get("title") ?? ""),
                description: String(formData.get("description") ?? ""),
                dueDate: String(formData.get("dueDate") ?? "") || null,
            });
            const error = result?.error ?? null;
            setError(error);
            if (error === null) {
                form.reset();
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
