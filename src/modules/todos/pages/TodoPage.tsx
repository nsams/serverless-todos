import { ArrowLeft } from "@dextinity/admin-icons";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Container,
    FormControlLabel,
    IconButton,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { type InferRequestType, parseResponse } from "hono/client";
import type { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, matchPath, useRouteError } from "react-router";

import { useChatPage } from "~/chat/useChatPage";
import { isNotFoundError, RouteErrorMessage } from "~/client/root";
import { useModuleRevalidator } from "~/client/routing";
import { useDocumentTitle } from "~/components/useDocumentTitle";
import { useUnsavedChangesPrompt } from "~/components/useUnsavedChangesPrompt";
import { errorMessage } from "~/errors";

import { todosClient } from "../api";
import { todosChatPage } from "../chatPage";
import { maxTodoDescriptionLength, maxTodoTitleLength } from "../limits";
import { todosModuleId } from "../moduleId";
import { useLists } from "../navigation";
import { listRoute, todoRoute } from "../routes";

// A todo's detail page (see todoRoute): a form, saved with its Save button. The search params are the state of the list's grid
// (ListPage.tsx), kept for the back link.

type Todo = ReturnType<typeof todoRoute.useLoaderData>;

export function TodoPage() {
    const todo = todoRoute.useLoaderData();
    // the stored title (the page data is reloaded after saving)
    useDocumentTitle(todo.title);
    // what the assistant gets to know about the page
    useChatPage(todosChatPage, { listId: todo.listId, todoId: todo.id });
    return (
        <TodoPageLayout>
            {/* a fresh form per todo */}
            <TodoForm key={todo.id} todo={todo} />
        </TodoPageLayout>
    );
}

// e.g. deleted by the assistant while open
export function TodoPageErrorBoundary() {
    const error = useRouteError();
    if (!isNotFoundError(error)) {
        return <RouteErrorMessage />;
    }
    return (
        <TodoPageLayout>
            <Paper sx={{ p: 4, textAlign: "center" }}>
                <Typography color="text.secondary">This todo doesn't exist (anymore).</Typography>
            </Paper>
        </TodoPageLayout>
    );
}

// The back link to the list's grid (in the state it was left) above the form
function TodoPageLayout({ children }: { children: ReactNode }) {
    const { listId } = todoRoute.useParams();
    const listLink = listRoute.href({ listId }, todoRoute.useSearch());
    const list = useLists().find((item) => item.id === listId);
    return (
        <Container sx={{ py: 4 }}>
            <Stack spacing={2}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Tooltip title="Back to the list">
                        <IconButton component={Link} to={listLink} edge="start" aria-label="Back to the list">
                            <ArrowLeft />
                        </IconButton>
                    </Tooltip>
                    <Typography color="text.secondary" noWrap>
                        {list?.name}
                    </Typography>
                </Box>
                {children}
            </Stack>
        </Container>
    );
}

// The form's values: the todo's fields as the inputs hold them ("" for no due date)
type TodoFormValues = { title: string; description: string; dueDate: string; done: boolean; listId: string };

function formValues(todo: Todo): TodoFormValues {
    return { title: todo.title, description: todo.description, dueDate: todo.dueDate ?? "", done: todo.done, listId: todo.listId };
}

function TodoForm({ todo }: { todo: Todo }) {
    const { revalidate, navigate } = useModuleRevalidator(todosModuleId);
    const search = todoRoute.useSearch();
    const lists = useLists();

    const {
        control,
        handleSubmit,
        reset,
        setError,
        formState: { isDirty, isSubmitting, errors },
    } = useForm<TodoFormValues>({
        // Changed elsewhere (e.g. by the assistant, the page data is reloaded after its changes): the form takes over the changes,
        // except for the fields the user has changed (they are saved over them)
        values: formValues(todo),
        resetOptions: { keepDirtyValues: true },
    });
    // resetOptions apply to every reset(): a reset by the form itself (saved, discarded) drops the changes
    const resetForm = (values?: TodoFormValues) => reset(values, { keepDirtyValues: false });

    // Saves the changed fields: the saved todo, undefined if saving failed. The caller reloads the page data.
    const save = async (values: TodoFormValues) => {
        const title = values.title.trim();
        const dueDate = values.dueDate || null;
        // the changed fields, undefined: unchanged (typed by the API's route: a renamed field breaks the build)
        const changes = {
            title: title !== todo.title ? title : undefined,
            description: values.description !== todo.description ? values.description : undefined,
            dueDate: dueDate !== todo.dueDate ? dueDate : undefined,
            done: values.done !== todo.done ? values.done : undefined,
            listId: values.listId !== todo.listId ? values.listId : undefined,
        } satisfies InferRequestType<(typeof todosClient.todos)[":id"]["$patch"]>["json"];
        try {
            const { updated } = await parseResponse(todosClient.todos[":id"].$patch({ param: { id: todo.id }, json: changes }));
            // the saved state is the form's new initial state (not dirty anymore)
            resetForm(formValues(updated));
            return updated;
        } catch (error) {
            // e.g. a ValidationError's message
            setError("root.server", { message: errorMessage(error, "Saving the todo failed, please try again.") });
            return undefined;
        }
    };

    // the Save button
    const onSubmit = handleSubmit(async (values) => {
        const updated = await save(values);
        if (!updated) {
            return;
        }
        if (updated.listId !== todo.listId) {
            // moved to another list: the URL follows the todo (also reloads the module's data, e.g. the sidebar's open counts)
            await navigate(todoRoute.href({ listId: updated.listId, todoId: todo.id }, search), { replace: true });
        } else {
            // e.g. the sidebar's open counts, the tab title
            await revalidate();
        }
    });

    // Leaving the page with unsaved changes: asks whether to save them first
    const unsavedChangesPrompt = useUnsavedChangesPrompt({
        dirty: isDirty,
        save: async () => {
            let saved = false;
            await handleSubmit(async (values) => {
                if (await save(values)) {
                    saved = true;
                    // not awaited: the dialog leaves right away, the navigation to the blocked target takes over the reload (React
                    // Router aborts the revalidation and loads the module's data with the next page)
                    void revalidate();
                }
            })();
            return saved;
        },
        // the URL following the todo to another list (after saving) doesn't leave the form
        stays: ({ nextLocation }) => matchPath(todoRoute.path, nextLocation.pathname)?.params.todoId === todo.id,
    });

    return (
        <Paper component="form" noValidate onSubmit={(event) => void onSubmit(event)} aria-label="Todo" sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Controller
                    name="title"
                    control={control}
                    rules={{
                        validate: (value) => value.trim() !== "" || "Title is required",
                        maxLength: { value: maxTodoTitleLength, message: `At most ${maxTodoTitleLength} characters` },
                    }}
                    render={({ field: { ref, ...field }, fieldState: { error } }) => (
                        <TextField
                            {...field}
                            inputRef={ref}
                            label="Title"
                            required
                            fullWidth
                            error={!!error}
                            helperText={error?.message}
                            slotProps={{ htmlInput: { maxLength: maxTodoTitleLength } }}
                        />
                    )}
                />
                <Controller
                    name="description"
                    control={control}
                    render={({ field: { ref, ...field } }) => (
                        <TextField
                            {...field}
                            inputRef={ref}
                            label="Description"
                            multiline
                            minRows={4}
                            fullWidth
                            slotProps={{ htmlInput: { maxLength: maxTodoDescriptionLength } }}
                        />
                    )}
                />
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                    <Controller
                        name="dueDate"
                        control={control}
                        render={({ field: { ref, ...field } }) => (
                            <TextField
                                {...field}
                                inputRef={ref}
                                label="Due"
                                type="date"
                                sx={{ width: 200 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                            />
                        )}
                    />
                    <Controller
                        name="listId"
                        control={control}
                        render={({ field: { ref, ...field } }) => (
                            <TextField {...field} inputRef={ref} label="List" select sx={{ minWidth: 200 }}>
                                {lists.map((list) => (
                                    <MenuItem key={list.id} value={list.id}>
                                        {list.name}
                                    </MenuItem>
                                ))}
                            </TextField>
                        )}
                    />
                    <Controller
                        name="done"
                        control={control}
                        render={({ field: { ref, value, onChange, ...field } }) => (
                            <FormControlLabel
                                label="Done"
                                control={<Checkbox {...field} inputRef={ref} checked={value} onChange={(event) => onChange(event.target.checked)} />}
                            />
                        )}
                    />
                </Box>
                {errors.root?.server && <Alert severity="error">{errors.root.server.message}</Alert>}
                <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                    <Button onClick={() => resetForm()} disabled={!isDirty || isSubmitting}>
                        Discard changes
                    </Button>
                    <Button type="submit" variant="contained" disabled={!isDirty} loading={isSubmitting}>
                        Save
                    </Button>
                </Box>
            </Stack>
            {unsavedChangesPrompt}
        </Paper>
    );
}
