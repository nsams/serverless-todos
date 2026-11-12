import { Button, Icon } from "@dextinity/ui";
import { DataGridPro, getGridBooleanOperators, getGridDateOperators, getGridStringOperators, GridActionsCellItem } from "@mui/x-data-grid-pro";
import { clsx } from "clsx";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";

import { useChatPage } from "~/chat/useChatPage";
import { useInvalidateModule, usePageQuery } from "~/client/queries";
import { CollectionHeader } from "~/components/CollectionHeader";
import { useShowError } from "~/components/ErrorSnackbar";
import { Checkbox } from "~/components/ui/Checkbox";
import layout from "~/components/ui/layout.module.css";
import { TextField } from "~/components/ui/TextField";
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
import { listRoute, listsRoute, todoRoute } from "../routes";
import { todoFields } from "../todoSearch";
import styles from "./ListPage.module.css";

type Todo = InferResponseType<(typeof todosClient.lists)[":listId"]["todos"]["$get"], 200>["todos"][number];

// The todos of a list in a grid (pagination, sorting, filtering on the server, state in the URL), see listRoute; the edit action opens
// a todo's detail page (TodoPage.tsx), which keeps the grid state for its back link
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
    const navigate = useNavigate();
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
                    onCheckedChange={(done) => void mutate(updateTodo(row.id, { done }))}
                    aria-label={`Mark “${row.title}” as ${row.done ? "open" : "done"}`}
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
                    <span className={styles.overdueDate}>
                        {/* accessible name and native tooltip */}
                        <Icon name="warning" aria-label="Overdue" title="Overdue" />
                        {formattedValue}
                    </span>
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
                    icon={<Icon name="edit" />}
                    label="Edit"
                    // the detail page keeps the grid's state for its back link
                    onClick={() => void navigate(todoRoute.href({ listId: list.id, todoId: row.id }, search))}
                />,
                <GridActionsCellItem
                    key="delete"
                    icon={<Icon name="delete" />}
                    label="Delete"
                    onClick={() => void mutate(parseResponse(todosClient.todos[":id"].$delete({ param: { id: row.id } })))}
                />,
                ...lists
                    .filter((otherList) => otherList.id !== list.id)
                    .map((otherList) => (
                        <GridActionsCellItem
                            key={`move-${otherList.id}`}
                            icon={<Icon name="move" />}
                            label={`Move to “${otherList.name}”`}
                            showInMenu
                            onClick={() => void mutate(updateTodo(row.id, { listId: otherList.id }))}
                        />
                    )),
            ],
        },
    ];

    return (
        <div className={layout.container}>
            <div className={layout.stack}>
                <ListHeader list={list} />
                <CreateTodoForm key={list.id} listId={list.id} onCreated={() => void invalidate()} />
                <div className={layout.end}>
                    <Button
                        variant="text"
                        color="error"
                        startIcon={<Icon name="warning" />}
                        onClick={() => updateSearch({ filter: [`dueDate:before:${today}`, "done:is:false"], filterLogic: undefined })}
                    >
                        Show overdue
                    </Button>
                </div>
                <div className={layout.paper}>
                    <DataGridPro
                        columns={columns}
                        autoHeight
                        disableRowSelectionOnClick
                        {...gridProps}
                        getRowClassName={({ row }) => (isOverdue(row, today) ? "overdue" : "")}
                        sx={{ border: 0, "& .overdue": { bgcolor: "var(--dextinity-color-feedback-danger-subtle)" } }}
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
                </div>
            </div>
        </div>
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
        <form onSubmit={(event) => void handleSubmit(event)} className={clsx(layout.paper, layout.padded, layout.stack)}>
            <div className={layout.wrapRow}>
                <TextField name="title" label="New todo" className={layout.grow} error={error} maxLength={maxTodoTitleLength} />
                <TextField name="dueDate" label="Due" type="date" className={styles.dueDate} />
                <Button type="submit" startIcon={<Icon name="add" />} loading={pending} className={styles.addButton}>
                    Add
                </Button>
            </div>
            <TextField name="description" label="Description (optional)" multiline rows={1} maxLength={maxTodoDescriptionLength} />
        </form>
    );
}
