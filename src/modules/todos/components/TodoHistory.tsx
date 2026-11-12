import { Alert, Box, Button, CircularProgress, Collapse, Divider, Paper, Stack, Typography } from "@mui/material";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { type ReactNode, useState } from "react";

import { fromDateString } from "~/dates";

import type { todosClient } from "../api";
import { listsQuery, todoHistoryQuery } from "../queries";

type TodoHistoryEntry = InferResponseType<(typeof todosClient.todos)[":id"]["history"]["$get"], 200>[number];
type Changes = TodoHistoryEntry["changes"];

const sourceLabels: Record<NonNullable<TodoHistoryEntry["source"]>, string> = {
    app: "in the app",
    chat: "by the assistant",
    mcp: "by an AI client (MCP)",
};

// A todo's history on its detail page: when it was created and every change (which fields, old and new value, where it was made),
// newest first. Loaded on its own (the form doesn't wait for it), reloaded with the module's data, e.g. after saving.
export function TodoHistory({ todoId }: { todoId: string }) {
    const { data: history, isPending, isError } = useQuery(todoHistoryQuery(todoId));
    return (
        <Paper component="section" aria-labelledby="todo-history-heading" sx={{ p: 2 }}>
            <Typography id="todo-history-heading" variant="h6" component="h2" gutterBottom>
                History
            </Typography>
            {isPending ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                    <CircularProgress size={24} aria-label="Loading the history" />
                </Box>
            ) : history ? (
                <Stack component="ol" divider={<Divider component="li" aria-hidden />} spacing={1.5} sx={{ listStyle: "none", m: 0, p: 0 }}>
                    {history.map((entry) => (
                        <HistoryEntry key={entry.id} entry={entry} />
                    ))}
                </Stack>
            ) : null}
            {/* a failed reload keeps the history shown */}
            {isError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                    Loading the history failed.
                </Alert>
            )}
        </Paper>
    );
}

function HistoryEntry({ entry }: { entry: TodoHistoryEntry }) {
    const createdAt = new Date(entry.createdAt);
    return (
        <Box component="li">
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", columnGap: 2, flexWrap: "wrap" }}>
                <Typography variant="subtitle2">
                    {entry.action === "created" ? "Created" : "Changed"}
                    {entry.source && (
                        <Typography component="span" variant="body2" color="text.secondary">
                            {" "}
                            {sourceLabels[entry.source]}
                        </Typography>
                    )}
                </Typography>
                <Typography component="time" dateTime={entry.createdAt} variant="body2" color="text.secondary">
                    {createdAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </Typography>
            </Box>
            {entry.action === "created" ? <InitialValues changes={entry.changes} /> : <FieldChanges changes={entry.changes} />}
        </Box>
    );
}

// The values a todo was created with (empty ones are left out; unknown for todos created before the history existed)
function InitialValues({ changes }: { changes: Changes }) {
    const listName = useListName();
    const { title, description, dueDate, done, listId } = changes;
    return (
        <ChangeList>
            {title && <Change label="Title">{title.to}</Change>}
            {description && description.to !== "" && <DescriptionChange to={description.to} />}
            {dueDate && dueDate.to !== null && <Change label="Due">{formatDueDate(dueDate.to)}</Change>}
            {listId && <Change label="List">{listName(listId.to)}</Change>}
            {done?.to && <Change label="Status">Done</Change>}
        </ChangeList>
    );
}

// The changed fields of an update: old → new value
function FieldChanges({ changes }: { changes: Changes }) {
    const listName = useListName();
    const { title, description, dueDate, done, listId } = changes;
    return (
        <ChangeList>
            {title && <Change label="Title">{fromTo(title.from, title.to)}</Change>}
            {description && <DescriptionChange from={description.from} to={description.to} />}
            {dueDate && (
                <Change label="Due">{fromTo(dueDate.from !== undefined ? formatDueDate(dueDate.from) : undefined, formatDueDate(dueDate.to))}</Change>
            )}
            {listId && <Change label="Moved">{fromTo(listId.from && listName(listId.from), listName(listId.to))}</Change>}
            {done && <Change label="Status">{done.to ? "Marked as done" : "Marked as open again"}</Change>}
        </ChangeList>
    );
}

function ChangeList({ children }: { children: ReactNode }) {
    return (
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
            {children}
        </Box>
    );
}

function Change({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Typography component="li" variant="body2" sx={{ overflowWrap: "anywhere" }}>
            <Typography component="span" variant="body2" color="text.secondary">
                {label}:
            </Typography>{" "}
            {children}
        </Typography>
    );
}

// Old and new value; the old one only if known
function fromTo(from: ReactNode, to: ReactNode) {
    return (
        <>
            {from !== undefined && (
                <>
                    <Box component="del" sx={{ color: "text.secondary" }}>
                        {from}
                    </Box>
                    {" → "}
                </>
            )}
            {to}
        </>
    );
}

// Descriptions can be long: shown on demand, the old one (if any) struck through above the new one
function DescriptionChange({ from, to }: { from?: string; to: string }) {
    const [open, setOpen] = useState(false);
    const summary = from === undefined ? "" : to === "" ? "removed" : from === "" ? "added" : "changed";
    return (
        <Change label="Description">
            {summary && `${summary} `}
            <Button size="small" onClick={() => setOpen(!open)} aria-expanded={open} sx={{ minWidth: 0, py: 0 }}>
                {open ? "Hide" : "Show"}
            </Button>
            <Collapse in={open} unmountOnExit>
                <Stack spacing={1} sx={{ mt: 0.5, mb: 1 }}>
                    {from && <DescriptionText deleted>{from}</DescriptionText>}
                    {to && <DescriptionText>{to}</DescriptionText>}
                </Stack>
            </Collapse>
        </Change>
    );
}

function DescriptionText({ children, deleted = false }: { children: string; deleted?: boolean }) {
    return (
        <Box
            component={deleted ? "del" : "div"}
            sx={{
                display: "block",
                whiteSpace: "pre-wrap",
                p: 1,
                borderRadius: 1,
                bgcolor: "action.hover",
                color: deleted ? "text.secondary" : "text.primary",
            }}
        >
            {children}
        </Box>
    );
}

// YYYY-MM-DD in the user's locale, "none" for no due date
function formatDueDate(value: string | null) {
    return value === null ? "none" : fromDateString(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

// The name of a list by its id; the list may have been deleted since (only the todo's other lists can be, its own list takes it with it).
// Waits for the lists (loaded already for the form's list field).
function useListName() {
    const lists = useSuspenseQuery(listsQuery).data;
    return (listId: string) => lists.find((list) => list.id === listId)?.name ?? "a deleted list";
}
