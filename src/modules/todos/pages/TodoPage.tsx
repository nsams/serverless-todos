import { ArrowLeft } from "@dextinity/admin-icons";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
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
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { useChatPage } from "~/chat/useChatPage";
import { PageError, PageErrorBoundary } from "~/client/errors";
import { useInvalidateModule, usePageQuery } from "~/client/queries";
import { useDocumentTitle } from "~/components/useDocumentTitle";
import { errorMessage, NotFoundError } from "~/errors";

import { todosClient } from "../api";
import { todosChatPage } from "../chatPage";
import { changedFields, type TodoDraftField } from "../draft/draft";
import { DraftPeers, DraftPeersOutline, DraftTextField } from "../draft/DraftFields";
import type { DraftSnapshot } from "../draft/draftSession";
import { useTodoDraft } from "../draft/useTodoDraft";
import { maxTodoDescriptionLength, maxTodoTitleLength } from "../limits";
import { todosModuleId } from "../moduleId";
import { listsQuery, todoQuery, useLists } from "../queries";
import { listRoute, todoRoute } from "../routes";

type Todo = InferResponseType<(typeof todosClient.todos)[":id"]["$get"], 200>;

// A todo's detail page: a form on the todo's shared draft, edited live by everyone who has it open (see todoRoute). The search params are the state of the list's grid
// (ListPage.tsx), kept for the back link.
export default function TodoPage() {
    return (
        <PageErrorBoundary Fallback={TodoPageError}>
            <TodoLoader />
        </PageErrorBoundary>
    );
}

function TodoLoader() {
    const { todoId } = todoRoute.useParams();
    const { data: todo } = usePageQuery(todoQuery, todoId);
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
function TodoPageError({ error }: { error: unknown }) {
    useDocumentTitle();
    if (!(error instanceof NotFoundError)) {
        return <PageError error={error} />;
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

// The labels of the fields, for the list of unpublished changes
const fieldLabels: Record<TodoDraftField, string> = { title: "Title", description: "Description", dueDate: "Due", done: "Done", listId: "List" };

// The form: edits the todo's shared draft live (draft/): everyone who has the form open (and the AI assistants) edits the same draft
// and sees the others' cursors. Publish saves the draft's changes to the todo, Discard drops them (for everyone).
function TodoForm({ todo }: { todo: Todo }) {
    const navigate = useNavigate();
    const { listId } = todoRoute.useParams();
    const search = todoRoute.useSearch();
    const queryClient = useQueryClient();
    const invalidate = useInvalidateModule(todosModuleId);
    // the options of the list field: waits for them (usually loaded already for the sidebar)
    const lists = useSuspenseQuery(listsQuery).data;
    // published by anyone (or changed elsewhere): e.g. the sidebar's open counts, the list's grid, the tab title
    const { session, snapshot } = useTodoDraft(todo.id, () => void invalidate());
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string>();

    const publishedListId = snapshot?.ready ? snapshot.published.listId : undefined;
    useEffect(() => {
        // moved to another list (published here or elsewhere): the URL follows the todo
        if (publishedListId && publishedListId !== listId) {
            void navigate(todoRoute.href({ listId: publishedListId, todoId: todo.id }, search), { replace: true });
        }
    }, [publishedListId, listId, navigate, todo.id, search]);

    useEffect(() => {
        // e.g. deleted by the assistant while open: the page shows that it doesn't exist anymore
        if (snapshot?.deleted) {
            void invalidate();
        }
    }, [snapshot?.deleted, invalidate]);

    if (!session || !snapshot?.ready) {
        return (
            <Paper sx={{ p: 4, display: "flex", justifyContent: "center" }}>
                <CircularProgress aria-label="Connecting to the draft" />
            </Paper>
        );
    }

    const { values, published } = snapshot;
    const changes = changedFields(values, published);
    const titleError = values.title.trim() === "" ? "Title is required" : undefined;

    const publish = async () => {
        setPublishing(true);
        setError(undefined);
        try {
            const { published: saved } = await parseResponse(todosClient.todos[":id"].publish.$post({ param: { id: todo.id } }));
            queryClient.setQueryData(todoQuery(todo.id).queryKey, saved);
            void invalidate();
        } catch (publishError) {
            // e.g. a ValidationError's message
            setError(errorMessage(publishError, "Publishing the todo failed, please try again."));
        } finally {
            setPublishing(false);
        }
    };

    // where the form is, for the others (fields without a text cursor)
    const presence = (field: TodoDraftField) => ({
        onFocus: () => session.setPresence({ field }),
        onBlur: () => session.setPresence(null),
    });

    return (
        <Paper
            component="form"
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                void publish();
            }}
            aria-label="Todo"
            sx={{ p: 2 }}
        >
            <Stack spacing={3}>
                <DraftPeers snapshot={snapshot} />
                <DraftTextField
                    session={session}
                    snapshot={snapshot}
                    field="title"
                    label="Title"
                    required
                    fullWidth
                    error={!!titleError}
                    helperText={titleError}
                    maxLength={maxTodoTitleLength}
                />
                <DraftTextField
                    session={session}
                    snapshot={snapshot}
                    field="description"
                    label="Description"
                    multiline
                    minRows={4}
                    fullWidth
                    maxLength={maxTodoDescriptionLength}
                />
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                    <DraftPeersOutline snapshot={snapshot} field="dueDate">
                        <TextField
                            label="Due"
                            type="date"
                            value={values.dueDate ?? ""}
                            onChange={(event) => session.setValues({ dueDate: event.target.value || null })}
                            {...presence("dueDate")}
                            sx={{ width: 200 }}
                            slotProps={{ inputLabel: { shrink: true } }}
                        />
                    </DraftPeersOutline>
                    <DraftPeersOutline snapshot={snapshot} field="listId">
                        <TextField
                            label="List"
                            select
                            value={lists.some((list) => list.id === values.listId) ? values.listId : ""}
                            onChange={(event) => session.setValues({ listId: event.target.value })}
                            {...presence("listId")}
                            sx={{ minWidth: 200 }}
                        >
                            {lists.map((list) => (
                                <MenuItem key={list.id} value={list.id}>
                                    {list.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    </DraftPeersOutline>
                    <DraftPeersOutline snapshot={snapshot} field="done">
                        <FormControlLabel
                            label="Done"
                            sx={{ mx: 0 }}
                            control={
                                <Checkbox
                                    checked={values.done}
                                    onChange={(event) => session.setValues({ done: event.target.checked })}
                                    {...presence("done")}
                                />
                            }
                        />
                    </DraftPeersOutline>
                </Box>
                {error && <Alert severity="error">{error}</Alert>}
                <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mr: "auto" }} role="status">
                        {draftStatus(snapshot, changes)}
                    </Typography>
                    <Button onClick={() => session.discard()} disabled={changes.length === 0 || publishing}>
                        Discard changes
                    </Button>
                    <Button type="submit" variant="contained" disabled={changes.length === 0 || !!titleError} loading={publishing}>
                        Publish
                    </Button>
                </Box>
            </Stack>
        </Paper>
    );
}

// The state of the draft below the form: the connection, the unpublished changes
function draftStatus(snapshot: DraftSnapshot, changes: TodoDraftField[]) {
    if (!snapshot.connected) {
        return snapshot.unsynced ? "Offline: your changes will be synced when the connection is back" : "Offline, reconnecting…";
    }
    if (snapshot.unsynced) {
        return "Syncing…";
    }
    if (changes.length === 0) {
        return "No unpublished changes";
    }
    return `Unpublished changes: ${changes.map((field) => fieldLabels[field]).join(", ")}`;
}
