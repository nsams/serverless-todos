import { Box, Chip, Stack, TextField, type TextFieldProps } from "@mui/material";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import * as Y from "yjs";

import { type RemoteCursor, RemoteCursors } from "~/components/RemoteCursors";

import type { DraftPeer, TodoDraftField, TodoDraftTextField } from "./draft";
import type { DraftSession, DraftSnapshot } from "./draftSession";

// The fields of the todo form on the shared draft (live editing, draft.ts): a text field typed into the draft character by character,
// showing the others' cursors; any other field marked while others are on it

export function peerName(peer: DraftPeer) {
    return peer.self ? "You (other window)" : peer.name;
}

type DraftTextFieldProps = Omit<TextFieldProps, "value" | "onChange" | "inputRef" | "onFocus" | "onBlur" | "slotProps"> & {
    session: DraftSession;
    snapshot: DraftSnapshot;
    field: TodoDraftTextField;
    maxLength?: number;
};

// A text field of the draft. The local cursor is kept as Yjs relative position, so it stays at its place when others change the text
// (the input's value is replaced, which moves the browser's cursor to the end).
export function DraftTextField({ session, snapshot, field, maxLength, ...props }: DraftTextFieldProps) {
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const selection = useRef<{ anchor: Y.RelativePosition; head: Y.RelativePosition } | null>(null);
    const value = snapshot.values[field];

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
                    session.setValues({ [field]: event.target.value });
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

// Marks a field (not a text field) while others are on it: an outline in their color and their names
export function DraftPeersOutline({ snapshot, field, children }: { snapshot: DraftSnapshot; field: TodoDraftField; children: ReactNode }) {
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
export function DraftPeers({ snapshot }: { snapshot: DraftSnapshot }) {
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
                    aria-label={`${peerName(peer)} is editing this todo`}
                />
            ))}
        </Stack>
    );
}
