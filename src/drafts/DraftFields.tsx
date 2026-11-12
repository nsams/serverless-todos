import { Alert, Box, Button, Chip, Stack, TextField, type TextFieldProps, Typography } from "@mui/material";
import { type CompositionEvent, type ReactNode, type SyntheticEvent, useLayoutEffect, useRef, useState } from "react";
import * as Y from "yjs";

import { type RemoteCursor, RemoteCursors } from "~/components/RemoteCursors";

import type { DraftPeer, DraftValues } from "./draft";
import type { DraftSession, DraftSnapshot } from "./draftSession";
import type { DraftForm } from "./useDraftForm";

// The building blocks of a form on a shared draft (draft.ts, useDraftForm): text fields typed into the draft character by character
// with the others' cursors, the marking of other fields while others are on them, who else is on the draft, and the form's actions
// (status, Discard, Publish).

export function peerName(peer: DraftPeer) {
    return peer.self ? "You (other window)" : peer.name;
}

type DraftTextFieldProps<Values extends DraftValues, TextField extends string> = Omit<
    TextFieldProps,
    "value" | "onChange" | "inputRef" | "inputProps" | "InputProps" | "InputLabelProps"
> & {
    session: DraftSession<Values, TextField>;
    snapshot: DraftSnapshot<Values>;
    // a text field of the draft's definition (not inferred from it: only the session tells which fields are text fields)
    field: NoInfer<TextField>;
    maxLength?: number;
};

type Selection = { anchor: Y.RelativePosition; head: Y.RelativePosition };

// A text field of the draft (MUI TextField, also multiline). The local cursor is kept as Yjs relative position, so it stays at its
// place when others change the text (the input's value is replaced, which moves the browser's cursor to the end). While an input
// method composes (e.g. Japanese), the input keeps its own value: the composed text goes into the draft when it is committed.
export function DraftTextField<Values extends DraftValues, TextField extends string>({
    session,
    snapshot,
    field,
    maxLength,
    slotProps,
    onFocus,
    onBlur,
    ...props
}: DraftTextFieldProps<Values, TextField>) {
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const selection = useRef<Selection | null>(null);
    // the input's value while an input method composes
    const [composing, setComposing] = useState<string | null>(null);
    const draftValue = String(snapshot.values[field] ?? "");
    const value = composing ?? draftValue;

    // the local selection, after every change and cursor move: kept and shown to the others
    const rememberSelection = () => {
        const input = inputRef.current;
        const text = session.text(field);
        if (!input || !text || document.activeElement !== input) {
            return;
        }
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? start;
        const backward = input.selectionDirection === "backward";
        const anchor = Y.createRelativePositionFromTypeIndex(text, backward ? end : start);
        const head = Y.createRelativePositionFromTypeIndex(text, backward ? start : end);
        selection.current = { anchor, head };
        session.setPresence({ field, anchor: Y.relativePositionToJSON(anchor), head: Y.relativePositionToJSON(head) });
    };

    // The input's new value into the draft, where its cursor says the change is (the previous selection's start, the cursor after it)
    const change = (input: HTMLInputElement | HTMLTextAreaElement) => {
        const previous = selection.current;
        const previousStart = previous
            ? Math.min(
                  Y.createAbsolutePositionFromRelativePosition(previous.anchor, session.doc)?.index ?? Infinity,
                  Y.createAbsolutePositionFromRelativePosition(previous.head, session.doc)?.index ?? Infinity,
              )
            : Infinity;
        const cursor = input.selectionEnd;
        session.setText(
            field,
            input.value,
            cursor === null ? undefined : { start: Math.min(previousStart, cursor), endFromEnd: input.value.length - cursor },
        );
        rememberSelection();
    };

    // the text changed (also by others): the local selection back at its place
    useLayoutEffect(() => {
        const input = inputRef.current;
        const current = selection.current;
        if (!input || !current || composing !== null || document.activeElement !== input) {
            return;
        }
        const anchor = Y.createAbsolutePositionFromRelativePosition(current.anchor, session.doc)?.index;
        const head = Y.createAbsolutePositionFromRelativePosition(current.head, session.doc)?.index;
        if (anchor === undefined || head === undefined) {
            return;
        }
        const start = Math.min(anchor, head);
        const end = Math.max(anchor, head);
        if (input.selectionStart !== start || input.selectionEnd !== end) {
            input.setSelectionRange(start, end, head < anchor ? "backward" : "forward");
        }
    }, [value, composing, session]);

    const cursors = snapshot.peers.flatMap((peer): RemoteCursor[] => {
        const presence = peer.presence;
        if (presence?.field !== field) {
            return [];
        }
        const anchor = absoluteIndex(session.doc, presence.anchor);
        const head = absoluteIndex(session.doc, presence.head);
        if (anchor === undefined || head === undefined) {
            return [];
        }
        return [{ id: peer.id, name: peerName(peer), color: peer.color, anchor, head }];
    });

    const htmlInput = typeof slotProps?.htmlInput === "object" ? slotProps.htmlInput : undefined;
    return (
        <Box data-remote-cursors-container sx={{ position: "relative" }}>
            <TextField
                {...props}
                value={value}
                inputRef={inputRef}
                onChange={(event) => {
                    if (composing !== null) {
                        setComposing(event.target.value);
                        return;
                    }
                    change(event.target);
                }}
                onFocus={(event) => {
                    onFocus?.(event);
                    rememberSelection();
                }}
                onBlur={(event) => {
                    onBlur?.(event);
                    selection.current = null;
                    session.setPresence(null);
                }}
                slotProps={{
                    ...slotProps,
                    htmlInput: {
                        ...htmlInput,
                        maxLength,
                        onSelect: (event: SyntheticEvent<HTMLInputElement>) => {
                            htmlInput?.onSelect?.(event);
                            if (composing === null) {
                                rememberSelection();
                            }
                        },
                        onCompositionStart: (event: CompositionEvent<HTMLInputElement>) => {
                            htmlInput?.onCompositionStart?.(event);
                            setComposing(event.currentTarget.value);
                        },
                        onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
                            htmlInput?.onCompositionEnd?.(event);
                            setComposing(null);
                            change(event.currentTarget);
                        },
                    },
                }}
            />
            <RemoteCursors input={inputRef} cursors={cursors} value={value} />
        </Box>
    );
}

// A relative position (JSON, from another form) as index in its text; undefined if invalid or not known (yet)
function absoluteIndex(doc: Y.Doc, json: unknown) {
    if (typeof json !== "object" || json === null) {
        return undefined;
    }
    try {
        return Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), doc)?.index;
    } catch {
        return undefined;
    }
}

// The focus handlers of a field that isn't a text field (e.g. a date, a select, a checkbox): tell the others which field the form is on
export function draftPresenceProps<Values extends DraftValues, TextField extends string>(
    session: DraftSession<Values, TextField>,
    field: keyof Values & string,
) {
    return {
        onFocus: () => session.setPresence({ field }),
        onBlur: () => session.setPresence(null),
    };
}

type DraftFieldPresenceProps<Values extends DraftValues> = {
    snapshot: DraftSnapshot<Values>;
    field: keyof Values & string;
    children: ReactNode;
};

// Marks a field that isn't a text field while others are on it (draftPresenceProps): an outline in their color and their names
export function DraftFieldPresence<Values extends DraftValues>({ snapshot, field, children }: DraftFieldPresenceProps<Values>) {
    const peers = snapshot.peers.filter((peer) => peer.presence?.field === field);
    return (
        <Box
            sx={{
                position: "relative",
                borderRadius: 1,
                outline: peers.length > 0 ? `2px solid ${peers[0].color}` : undefined,
                outlineOffset: 2,
            }}
        >
            {children}
            {peers.length > 0 && (
                <Stack direction="row" spacing={0.5} sx={{ position: "absolute", top: 0, right: 0, transform: "translateY(-100%)", zIndex: 1 }}>
                    {peers.map((peer) => (
                        <Box
                            key={peer.id}
                            sx={{
                                px: 0.5,
                                borderRadius: "3px 3px 0 0",
                                bgcolor: peer.color,
                                color: "#fff",
                                fontSize: 11,
                                lineHeight: "16px",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {peerName(peer)}
                        </Box>
                    ))}
                </Stack>
            )}
        </Box>
    );
}

// Who else is on the draft
export function DraftPeers<Values extends DraftValues>({ snapshot }: { snapshot: DraftSnapshot<Values> }) {
    if (snapshot.peers.length === 0) {
        return null;
    }
    return (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
            {snapshot.peers.map((peer) => (
                <Chip
                    key={peer.id}
                    size="small"
                    label={peerName(peer)}
                    sx={{ bgcolor: peer.color, color: "#fff" }}
                    aria-label={`${peerName(peer)} is editing this`}
                />
            ))}
        </Stack>
    );
}

type DraftFormActionsProps<Values extends DraftValues, TextField extends string> = {
    form: DraftForm<Values, TextField>;
    snapshot: DraftSnapshot<Values>;
    // the fields' labels, for the list of unpublished changes
    fieldLabels: Record<keyof Values & string, string>;
    // e.g. false while a required field is empty (the field shows why); the server validates anyway
    canPublish?: boolean;
};

// Below the form: why publishing failed, the draft's state (connection, unpublished changes), Discard changes (for everyone) and
// Publish (a submit button: the form's onSubmit calls form.publish; disabled while offline, it waits for the form's changes to be synced)
export function DraftFormActions<Values extends DraftValues, TextField extends string>({
    form,
    snapshot,
    fieldLabels,
    canPublish = true,
}: DraftFormActionsProps<Values, TextField>) {
    const changes = snapshot.changedFields.map((field) => fieldLabels[field]);
    return (
        <>
            {form.error && <Alert severity="error">{form.error}</Alert>}
            <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                {/* the visible state includes "Syncing…" while typing; screen readers only get the lasting state */}
                <Typography variant="body2" color="text.secondary" sx={{ mr: "auto" }} aria-hidden>
                    {draftStatus(snapshot, changes)}
                </Typography>
                <Box role="status" sx={visuallyHidden}>
                    {draftStatus({ ...snapshot, unsynced: snapshot.unsynced && !snapshot.connected }, changes)}
                </Box>
                <Button onClick={form.discard} disabled={changes.length === 0 || form.publishing}>
                    Discard changes
                </Button>
                <Button
                    type="submit"
                    variant="contained"
                    disabled={changes.length === 0 || !canPublish || !snapshot.connected}
                    loading={form.publishing}
                >
                    Publish
                </Button>
            </Box>
        </>
    );
}

// Read by screen readers, not shown
const visuallyHidden = {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    margin: -1,
    padding: 0,
    border: 0,
} as const;

// The state of the draft: the connection, the unpublished changes
function draftStatus(snapshot: Pick<DraftSnapshot<DraftValues>, "connected" | "unsynced">, changes: string[]) {
    if (!snapshot.connected) {
        return snapshot.unsynced ? "Offline: your changes will be synced when the connection is back" : "Offline, reconnecting…";
    }
    if (snapshot.unsynced) {
        return "Syncing…";
    }
    if (changes.length === 0) {
        return "No unpublished changes";
    }
    return `Unpublished changes: ${changes.join(", ")}`;
}
