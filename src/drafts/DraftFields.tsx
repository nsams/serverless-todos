import { Alert, Box, Button, Chip, Stack, TextField, type TextFieldProps, Typography } from "@mui/material";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import * as Y from "yjs";

import { type RemoteCursor, RemoteCursors } from "~/components/RemoteCursors";

import type { DraftPeer, DraftTextField as DraftTextFieldName, DraftValues } from "./draft";
import type { DraftSession, DraftSnapshot } from "./draftSession";
import type { DraftForm } from "./useDraftForm";

// The building blocks of a form on a shared draft (draft.ts, useDraftForm): text fields typed into the draft character by character
// with the others' cursors, the marking of other fields while others are on them, who else is on the draft, and the form's actions
// (status, Discard, Publish).

export function peerName(peer: DraftPeer) {
    return peer.self ? "You (other window)" : peer.name;
}

type DraftTextFieldProps<Values extends DraftValues> = Omit<
    TextFieldProps,
    "value" | "onChange" | "inputRef" | "onFocus" | "onBlur" | "slotProps"
> & {
    session: DraftSession<Values>;
    snapshot: DraftSnapshot<Values>;
    // a text field of the draft's definition
    field: DraftTextFieldName<Values>;
    maxLength?: number;
};

// A text field of the draft (MUI TextField, also multiline). The local cursor is kept as Yjs relative position, so it stays at its
// place when others change the text (the input's value is replaced, which moves the browser's cursor to the end).
export function DraftTextField<Values extends DraftValues>({ session, snapshot, field, maxLength, ...props }: DraftTextFieldProps<Values>) {
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const selection = useRef<{ anchor: Y.RelativePosition; head: Y.RelativePosition } | null>(null);
    const value = String(snapshot.values[field] ?? "");

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

    // the text changed (also by others): the local selection back at its place
    useLayoutEffect(() => {
        const input = inputRef.current;
        const current = selection.current;
        if (!input || !current || document.activeElement !== input) {
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
    }, [value, session]);

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

    return (
        <Box data-remote-cursors-container sx={{ position: "relative" }}>
            <TextField
                {...props}
                value={value}
                inputRef={inputRef}
                onChange={(event) => {
                    session.setValues({ [field]: event.target.value } as Partial<Values>);
                    rememberSelection();
                }}
                onFocus={rememberSelection}
                onBlur={() => {
                    selection.current = null;
                    session.setPresence(null);
                }}
                slotProps={{ htmlInput: { maxLength, onSelect: rememberSelection } }}
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
export function draftPresenceProps<Values extends DraftValues>(session: DraftSession<Values>, field: keyof Values & string) {
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

type DraftFormActionsProps<Values extends DraftValues> = {
    form: DraftForm<Values>;
    snapshot: DraftSnapshot<Values>;
    // the fields' labels, for the list of unpublished changes
    fieldLabels: Record<keyof Values & string, string>;
    // e.g. false while a required field is empty (the field shows why); the server validates anyway
    canPublish?: boolean;
};

// Below the form: why publishing failed, the draft's state (connection, unpublished changes), Discard changes (for everyone) and
// Publish (a submit button: the form's onSubmit calls form.publish)
export function DraftFormActions<Values extends DraftValues>({ form, snapshot, fieldLabels, canPublish = true }: DraftFormActionsProps<Values>) {
    const changes = snapshot.changedFields;
    return (
        <>
            {form.error && <Alert severity="error">{form.error}</Alert>}
            <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography variant="body2" color="text.secondary" sx={{ mr: "auto" }} role="status">
                    {draftStatus(
                        snapshot,
                        changes.map((field) => fieldLabels[field]),
                    )}
                </Typography>
                <Button onClick={form.discard} disabled={changes.length === 0 || form.publishing}>
                    Discard changes
                </Button>
                <Button type="submit" variant="contained" disabled={changes.length === 0 || !canPublish} loading={form.publishing}>
                    Publish
                </Button>
            </Box>
        </>
    );
}

// The state of the draft: the connection, the unpublished changes
function draftStatus<Values extends DraftValues>(snapshot: DraftSnapshot<Values>, changes: string[]) {
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
