import { Alert, Box, Button, Chip, Stack, TextField, type TextFieldProps, Typography } from "@mui/material";
import type { TextFieldOwnerState } from "@mui/material/TextField";
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

// An input method's composition: the input's value and selection when it started, the selection's edges in the text
type Composition = { base: string; start: number; end: number; startPosition: Y.RelativePosition; endPosition: Y.RelativePosition };

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
    // While an input method composes: the input's own value (shown instead of the draft's), and where the composition started
    const [composing, setComposing] = useState<string | null>(null);
    const composition = useRef<Composition | null>(null);
    // the input's value when the last composition was committed (an input event some browsers send after compositionend)
    const committed = useRef<string | null>(null);
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
        setSelection(text, backward ? end : start, backward ? start : end);
    };

    const setSelection = (text: Y.Text, anchorIndex: number, headIndex: number) => {
        const anchor = Y.createRelativePositionFromTypeIndex(text, anchorIndex);
        const head = Y.createRelativePositionFromTypeIndex(text, headIndex);
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
        session.setText(field, input.value, cursor === null ? undefined : { start: Math.min(previousStart, cursor) });
        rememberSelection();
    };

    const startComposition = (input: HTMLInputElement | HTMLTextAreaElement) => {
        const text = session.text(field);
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? start;
        composition.current = text
            ? {
                  base: input.value,
                  start,
                  end,
                  // the start sticks to the character after it, the end to the one before it: others' typing at the edges stays theirs
                  startPosition: Y.createRelativePositionFromTypeIndex(text, start),
                  endPosition: Y.createRelativePositionFromTypeIndex(text, end, -1),
              }
            : null;
        setComposing(input.value);
    };

    // The committed composition into the draft: only what it changed (the composed text in place of the selection it started with), so
    // what others changed in the meantime (not shown while composing) is kept
    const commitComposition = (input: HTMLInputElement | HTMLTextAreaElement) => {
        const started = composition.current;
        composition.current = null;
        committed.current = input.value;
        setComposing(null);
        const text = session.text(field);
        const final = input.value;
        if (!started || !text) {
            change(input);
            return;
        }
        const { base, start, end } = started;
        const suffix = base.slice(end);
        if (final === base) {
            return;
        }
        if (!final.startsWith(base.slice(0, start)) || !final.endsWith(suffix) || final.length - suffix.length < start) {
            // changed elsewhere than where it started (unusual): as any change
            change(input);
            return;
        }
        const composed = final.slice(start, final.length - suffix.length);
        const from = Y.createAbsolutePositionFromRelativePosition(started.startPosition, session.doc)?.index;
        const to = Y.createAbsolutePositionFromRelativePosition(started.endPosition, session.doc)?.index;
        if (from === undefined || to === undefined) {
            change(input);
            return;
        }
        session.doc.transact(() => {
            if (to > from) {
                text.delete(from, to - from);
            }
            if (composed) {
                text.insert(from, composed);
            }
        });
        // the cursor after the composed text (restored by the layout effect)
        setSelection(text, from + composed.length, from + composed.length);
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

    const htmlInputProps = slotProps?.htmlInput;
    return (
        <Box data-remote-cursors-container sx={{ position: "relative" }}>
            <TextField
                {...props}
                value={value}
                inputRef={inputRef}
                onChange={(event) => {
                    if (composition.current) {
                        setComposing(event.target.value);
                        return;
                    }
                    // the input event some browsers send after committing a composition: already in the draft
                    if (committed.current !== null && committed.current === event.target.value) {
                        committed.current = null;
                        return;
                    }
                    committed.current = null;
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
                    // merged with the caller's (an object or a function of the owner state)
                    htmlInput: (ownerState: TextFieldOwnerState) => {
                        const own = typeof htmlInputProps === "function" ? htmlInputProps(ownerState) : htmlInputProps;
                        return {
                            ...own,
                            maxLength: maxLength ?? (own as { maxLength?: number } | undefined)?.maxLength,
                            onSelect: (event: SyntheticEvent<HTMLInputElement>) => {
                                own?.onSelect?.(event);
                                if (!composition.current) {
                                    rememberSelection();
                                }
                            },
                            onCompositionStart: (event: CompositionEvent<HTMLInputElement>) => {
                                own?.onCompositionStart?.(event);
                                startComposition(event.currentTarget);
                            },
                            onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
                                own?.onCompositionEnd?.(event);
                                commitComposition(event.currentTarget);
                            },
                        };
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
    // strings: numbers would be theme values in sx (1 = 100%, -1 = -8px)
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    margin: "-1px",
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
