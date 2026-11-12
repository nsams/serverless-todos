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
import type { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { href, isRouteErrorResponse, Link, matchPath, useLocation, useNavigate } from "react-router";

import { appName } from "~/app";
import { useChatPage } from "~/chat/useChatPage";
import { useUnsavedChangesPrompt } from "~/components/useUnsavedChangesPrompt";
import { errorMessage } from "~/errors";
import { validateGridSearch } from "~/gridSearch";
import { revalidateOnChangesOf } from "~/modules/client";
import type { OperationInput } from "~/operations";
import { loadOperation } from "~/routeOperations.server";
import { parseSearch, stringifySearch } from "~/searchParams";

import { todosChatPage } from "../chatPage";
import { useLists, useTodoOperations } from "../client";
import { maxTodoDescriptionLength, maxTodoTitleLength } from "../limits";
import { todosModuleId } from "../moduleId";
import { todoOperations, type TodoView } from "../operations.server";
import type { Route } from "./+types/lists.$listId.$todoId";

// A todo's detail page: a form, saved with its Save button. The search params are the state of the list's grid (lists.$listId.index.tsx),
// kept for the back link.
// Unlike the note editor's loader, this one doesn't redirect to the todo's list when it was moved elsewhere: the reload after saving in
// the "Save changes?" dialog would then navigate to the todo's new URL instead of the page the user was leaving.
export async function loader({ params: { todoId }, context }: Route.LoaderArgs) {
    return loadOperation(todoOperations.getTodo, context, { id: todoId });
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: loaderData ? `${loaderData.title} – ${appName}` : appName }];

export const shouldRevalidate = revalidateOnChangesOf(todosModuleId);

export default function TodoPage({ loaderData: todo, params }: Route.ComponentProps) {
    // what the assistant gets to know about the page
    useChatPage(todosChatPage, { listId: todo.listId, todoId: todo.id });

    return (
        <TodoPageLayout listId={params.listId}>
            {/* a fresh form per todo */}
            <TodoForm key={todo.id} todo={todo} />
        </TodoPageLayout>
    );
}

// e.g. deleted by the assistant while open
export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
    if (!isRouteErrorResponse(error) || error.status !== 404) {
        throw error;
    }
    return (
        <TodoPageLayout listId={params.listId}>
            <Paper sx={{ p: 4, textAlign: "center" }}>
                <Typography color="text.secondary">This todo doesn't exist (anymore).</Typography>
            </Paper>
        </TodoPageLayout>
    );
}

// The grid state of the list (the todo's search params)
function useGridSearch() {
    return stringifySearch(validateGridSearch(parseSearch(useLocation().search)));
}

// The back link to the list's grid (in the state it was left) above the form
function TodoPageLayout({ listId, children }: { listId: string; children: ReactNode }) {
    const listUrl = href("/lists/:listId", { listId }) + useGridSearch();
    const list = useLists().find((item) => item.id === listId);
    return (
        <Container sx={{ py: 4 }}>
            <Stack spacing={2}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Tooltip title="Back to the list">
                        <IconButton component={Link} to={listUrl} edge="start" aria-label="Back to the list">
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

function formValues(todo: TodoView): TodoFormValues {
    return { title: todo.title, description: todo.description, dueDate: todo.dueDate ?? "", done: todo.done, listId: todo.listId };
}

function TodoForm({ todo }: { todo: TodoView }) {
    const { run } = useTodoOperations();
    const navigate = useNavigate();
    const gridSearch = useGridSearch();
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

    // Saves the changed fields: the saved todo, undefined if saving failed
    const save = async (values: TodoFormValues) => {
        const title = values.title.trim();
        const dueDate = values.dueDate || null;
        // the changed fields (unchanged ones are undefined, so they aren't sent); typed by the operation, so renaming one of its fields
        // breaks the build
        const changes = {
            id: todo.id,
            title: title !== todo.title ? title : undefined,
            description: values.description !== todo.description ? values.description : undefined,
            dueDate: dueDate !== todo.dueDate ? dueDate : undefined,
            done: values.done !== todo.done ? values.done : undefined,
            listId: values.listId !== todo.listId ? values.listId : undefined,
        } satisfies OperationInput<typeof todoOperations.updateTodo>;
        try {
            // resolves once the page data is reloaded (e.g. the sidebar's open counts, the page title)
            const { updated } = await run("updateTodo", changes);
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
        if (updated && updated.listId !== todo.listId) {
            // moved to another list: the URL follows the todo
            await navigate(href("/lists/:listId/:todoId", { listId: updated.listId, todoId: todo.id }) + gridSearch, { replace: true });
        }
    });

    // Leaving the page with unsaved changes: asks whether to save them first
    const unsavedChangesPrompt = useUnsavedChangesPrompt({
        dirty: isDirty,
        save: async () => {
            let saved = false;
            await handleSubmit(async (values) => {
                saved = (await save(values)) !== undefined;
            })();
            return saved;
        },
        // the URL following the todo to another list (after saving; the blocker still has the dirty state of the last render then)
        // doesn't leave the form
        stays: ({ nextLocation }) => matchPath("/lists/:listId/:todoId", nextLocation.pathname)?.params.todoId === todo.id,
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
