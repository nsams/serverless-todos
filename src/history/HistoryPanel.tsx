import { Alert, Box, Button, CircularProgress, Collapse, Divider, Paper, Stack, Typography } from "@mui/material";
import { type QueryKey, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";

import { NotFoundError } from "~/errors";
import type { OperationSource } from "~/operations";

import type { HistoryAction, HistoryEntryView } from "./history";

// How an entity type's recorded fields are shown in its history, e.g. { title: { label: "Title" }, done: { label: "Status", format: ... } }
export type HistoryFields<Values> = {
    [Field in keyof Values]-?: {
        label: string;
        // the value as text, e.g. a list's name for its id; default: the value itself
        format?: (value: Values[Field]) => ReactNode;
        // long text (e.g. a description): shown on demand
        long?: boolean;
    };
};

const actionLabels: Record<HistoryAction, string> = { created: "Created", updated: "Changed", deleted: "Deleted" };

const sourceLabels: Record<OperationSource, string> = {
    app: "in the app",
    chat: "by the assistant",
    mcp: "by an AI client (MCP)",
};

// The history of an entity (shared history, src/history/), e.g. on a todo's detail page: its creation, every change (which fields, old
// and new value) and its deletion, each with when and where, newest first. Loads the entries itself (query: the entity's history query),
// so the page doesn't wait for them; reloaded with the module's data. Shows nothing if the entity has no history (404).
export function HistoryPanel<Values, Key extends QueryKey = QueryKey>({
    query,
    fields,
}: {
    query: UseQueryOptions<Array<HistoryEntryView<Values>>, Error, Array<HistoryEntryView<Values>>, Key>;
    fields: HistoryFields<Values>;
}) {
    // its errors are shown here, not by the page's error boundary (the page shows the entity without its history)
    const { data: entries, isPending, error } = useQuery({ ...query, throwOnError: false });
    const headingId = useId();
    if (error instanceof NotFoundError) {
        return null;
    }
    return (
        <Paper component="section" aria-labelledby={headingId} sx={{ p: 2 }}>
            <Typography id={headingId} variant="h6" component="h2" gutterBottom>
                History
            </Typography>
            {isPending ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                    <CircularProgress size={24} aria-label="Loading the history" />
                </Box>
            ) : entries ? (
                <Stack component="ol" divider={<Divider component="li" aria-hidden />} spacing={1.5} sx={{ listStyle: "none", m: 0, p: 0 }}>
                    {entries.map((entry) => (
                        <HistoryEntry key={entry.id} entry={entry} fields={fields} />
                    ))}
                </Stack>
            ) : null}
            {/* a failed reload keeps the entries shown */}
            {error && (
                <Alert severity="error" sx={{ mt: 1 }}>
                    Loading the history failed.
                </Alert>
            )}
        </Paper>
    );
}

function HistoryEntry<Values>({ entry, fields }: { entry: HistoryEntryView<Values>; fields: HistoryFields<Values> }) {
    // in the order of the field definitions; only the recorded ones (e.g. the changed fields of an update)
    const recorded = (Object.keys(fields) as Array<keyof Values>).filter((field) => entry.changes[field] !== undefined);
    return (
        <Box component="li">
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", columnGap: 2, flexWrap: "wrap" }}>
                <Typography variant="subtitle2">
                    {actionLabels[entry.action]}
                    {entry.source && (
                        <Typography component="span" variant="body2" color="text.secondary">
                            {" "}
                            {sourceLabels[entry.source]}
                        </Typography>
                    )}
                </Typography>
                <Typography component="time" dateTime={entry.createdAt} variant="body2" color="text.secondary">
                    {new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </Typography>
            </Box>
            {recorded.length > 0 && (
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                    {recorded.map((field) => {
                        const change = entry.changes[field];
                        return change && <FieldEntry key={String(field)} action={entry.action} change={change} field={fields[field]} />;
                    })}
                </Box>
            )}
        </Box>
    );
}

// A recorded field: created: its initial value; updated: old → new value; deleted: its last value. Empty values ("" or null) of a
// created or deleted entity are left out.
function FieldEntry<Value>({
    action,
    change,
    field: { label, format = (value) => String(value), long = false },
}: {
    action: HistoryAction;
    change: { from?: Value; to?: Value };
    field: HistoryFields<{ value: Value }>["value"];
}) {
    const value = (action === "deleted" ? change.from : change.to) as Value;
    const old = action === "updated" ? { value: change.from as Value } : undefined;
    if (!old && isEmpty(value)) {
        return null;
    }
    if (long) {
        return <LongFieldEntry label={label} value={value} old={old} format={format} />;
    }
    return (
        <FieldItem label={label}>
            {old && (
                <>
                    <Box component="del" sx={{ color: "text.secondary" }}>
                        {format(old.value)}
                    </Box>
                    {" → "}
                </>
            )}
            {format(value)}
        </FieldItem>
    );
}

// Long text, shown on demand: the old value (if any) struck through above the new one
function LongFieldEntry<Value>({
    label,
    value,
    old,
    format,
}: {
    label: string;
    value: Value;
    old?: { value: Value };
    format: (value: Value) => ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const summary = old && (isEmpty(value) ? "removed" : isEmpty(old.value) ? "added" : "changed");
    return (
        <FieldItem label={label}>
            {summary && `${summary} `}
            <Button size="small" onClick={() => setOpen(!open)} aria-expanded={open} sx={{ minWidth: 0, py: 0 }}>
                {open ? "Hide" : "Show"}
            </Button>
            <Collapse in={open} unmountOnExit>
                <Stack spacing={1} sx={{ mt: 0.5, mb: 1 }}>
                    {old && !isEmpty(old.value) && <LongText deleted>{format(old.value)}</LongText>}
                    {!isEmpty(value) && <LongText>{format(value)}</LongText>}
                </Stack>
            </Collapse>
        </FieldItem>
    );
}

function isEmpty(value: unknown) {
    return value === undefined || value === null || value === "";
}

function FieldItem({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Typography component="li" variant="body2" sx={{ overflowWrap: "anywhere" }}>
            <Typography component="span" variant="body2" color="text.secondary">
                {label}:
            </Typography>{" "}
            {children}
        </Typography>
    );
}

function LongText({ children, deleted = false }: { children: ReactNode; deleted?: boolean }) {
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
