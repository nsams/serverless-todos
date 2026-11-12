import * as Y from "yjs";
import { z } from "zod";

// The shared draft of a todo (live editing): everyone who has the todo's form open edits the same draft, the AI assistants (chat, MCP
// server) edit it too (operation updateTodo). The todo itself only changes when the draft is published (operation publishTodo).
// Shared by the draft's Durable Object (draftAgent.server.ts) and the form (useTodoDraft.ts).
//
// The draft is a Yjs document (CRDT): concurrent edits merge, also in the same text field (title and description are Y.Text, typed
// character by character), and the cursors of the others are relative positions in these texts, so they stay at their place while
// the text changes. The document holds
// - "draft": the form's values (title and description as Y.Text, the other fields as plain values),
// - "published": the todo as stored (the state the draft started from, updated after it was published or changed elsewhere), to tell
//   which fields the draft changes.

// The form's fields: the editable fields of a todo
export type TodoDraftValues = {
    title: string;
    description: string;
    // YYYY-MM-DD, null: no due date
    dueDate: string | null;
    done: boolean;
    listId: string;
};

export type TodoDraftField = keyof TodoDraftValues;

export const todoDraftFields = ["title", "description", "dueDate", "done", "listId"] as const satisfies readonly TodoDraftField[];

// The fields typed character by character (Y.Text): concurrent edits merge, the others' cursors are shown
export const todoDraftTextFields = ["title", "description"] as const satisfies readonly TodoDraftField[];

export type TodoDraftTextField = (typeof todoDraftTextFields)[number];

export function isTextField(field: TodoDraftField): field is TodoDraftTextField {
    return (todoDraftTextFields as readonly string[]).includes(field);
}

export function draftValues<Todo extends TodoDraftValues>({ title, description, dueDate, done, listId }: Todo): TodoDraftValues {
    return { title, description, dueDate, done, listId };
}

function draftMap(doc: Y.Doc) {
    return doc.getMap<unknown>("draft");
}

function publishedMap(doc: Y.Doc) {
    return doc.getMap<unknown>("published");
}

// The Y.Text of a text field (created by initDraft)
export function draftText(doc: Y.Doc, field: TodoDraftTextField): Y.Text | undefined {
    const text = draftMap(doc).get(field);
    return text instanceof Y.Text ? text : undefined;
}

// Whether the document holds a draft (initDraft ran, here or on the server the document was synced with)
export function hasDraft(doc: Y.Doc) {
    return publishedMap(doc).size > 0;
}

function readValues(map: Y.Map<unknown>): TodoDraftValues {
    const value = (field: TodoDraftField) => {
        const item = map.get(field);
        return item instanceof Y.Text ? item.toString() : item;
    };
    return {
        title: String(value("title") ?? ""),
        description: String(value("description") ?? ""),
        dueDate: typeof value("dueDate") === "string" ? (value("dueDate") as string) : null,
        done: value("done") === true,
        listId: String(value("listId") ?? ""),
    };
}

export function readDraft(doc: Y.Doc): TodoDraftValues {
    return readValues(draftMap(doc));
}

export function readPublished(doc: Y.Doc): TodoDraftValues {
    return readValues(publishedMap(doc));
}

// The fields whose draft value differs from the published one: the changes publishing saves
export function changedFields(draft: TodoDraftValues, published: TodoDraftValues): TodoDraftField[] {
    return todoDraftFields.filter((field) => draft[field] !== published[field]);
}

// Starts the draft from the stored todo (on the server, once per todo)
export function initDraft(doc: Y.Doc, todo: TodoDraftValues) {
    doc.transact(() => {
        const draft = draftMap(doc);
        for (const field of todoDraftFields) {
            draft.set(field, isTextField(field) ? new Y.Text(todo[field]) : todo[field]);
        }
        setPublished(doc, todo);
    });
}

function setPublished(doc: Y.Doc, todo: TodoDraftValues) {
    const published = publishedMap(doc);
    for (const field of todoDraftFields) {
        if (published.get(field) !== todo[field]) {
            published.set(field, todo[field]);
        }
    }
}

// Changes fields of the draft (the form, the AI assistants, discarding). A text field is changed by its difference to the current
// text (applyTextChange), so the others' cursors and their concurrent typing elsewhere in the text are kept.
export function setDraftValues(doc: Y.Doc, values: Partial<TodoDraftValues>, origin?: unknown) {
    doc.transact(() => {
        const draft = draftMap(doc);
        for (const field of todoDraftFields) {
            const value = values[field];
            if (value === undefined) {
                continue;
            }
            if (isTextField(field)) {
                const text = draftText(doc, field);
                if (text) {
                    applyTextChange(text, value as string);
                }
            } else if (draft.get(field) !== value) {
                draft.set(field, value);
            }
        }
    }, origin);
}

// Changes a text to a new value by deleting and inserting only the part in between the common prefix and suffix (e.g. a typed
// character is one insertion at the cursor)
export function applyTextChange(text: Y.Text, value: string) {
    const current = text.toString();
    if (current === value) {
        return;
    }
    let start = 0;
    while (start < current.length && start < value.length && current[start] === value[start]) {
        start++;
    }
    let end = 0;
    while (end < current.length - start && end < value.length - start && current[current.length - 1 - end] === value[value.length - 1 - end]) {
        end++;
    }
    const deleteCount = current.length - start - end;
    if (deleteCount > 0) {
        text.delete(start, deleteCount);
    }
    const insert = value.slice(start, value.length - end);
    if (insert) {
        text.insert(start, insert);
    }
}

// The stored todo changed (published, or changed elsewhere, e.g. the done checkbox of the list's grid): the fields the draft doesn't
// change follow it, the draft's changes are kept. Fields whose draft value was just published (`publishedDraft`, before the
// operation normalized it, e.g. trimmed the title) follow it too.
export function rebaseDraft(doc: Y.Doc, todo: TodoDraftValues, publishedDraft?: TodoDraftValues) {
    doc.transact(() => {
        const draft = readDraft(doc);
        const published = readPublished(doc);
        const follow = todoDraftFields.filter(
            (field) => draft[field] === published[field] || (publishedDraft !== undefined && draft[field] === publishedDraft[field]),
        );
        setDraftValues(doc, Object.fromEntries(follow.map((field) => [field, todo[field]])));
        setPublished(doc, todo);
    });
}

// Discards the draft's changes (for everyone): the draft is the published todo again
export function discardDraft(doc: Y.Doc, origin?: unknown) {
    setDraftValues(doc, readPublished(doc), origin);
}

// The protocol between the form and the draft's Durable Object: JSON messages on the WebSocket (besides the Agents SDK's own messages),
// Yjs updates as base64

// Where the form is (a field and, in a text field, the selection as Yjs relative positions, JSON), shown to the others as cursor
export const draftPresenceSchema = z.object({
    field: z.enum(todoDraftFields),
    anchor: z.unknown().optional(),
    head: z.unknown().optional(),
});

export type DraftPresence = z.infer<typeof draftPresenceSchema>;

// Another form on the draft (another user, or the same user in another tab or on another device)
export type DraftPeer = {
    // the connection's id
    id: string;
    // the user's email
    name: string;
    // the same user as the recipient (e.g. another tab)
    self: boolean;
    color: string;
    presence: DraftPresence | null;
};

export const draftClientMessageSchema = z.discriminatedUnion("type", [
    // after connecting: the client's whole document (its changes made while disconnected) and its state vector; the server answers
    // with "synced"
    z.object({ type: z.literal("sync"), update: z.base64(), stateVector: z.base64() }),
    // a change of the client's document
    z.object({ type: z.literal("update"), update: z.base64() }),
    z.object({ type: z.literal("presence"), presence: draftPresenceSchema.nullable() }),
    // answered with "ack" once the server has the messages sent before (they are handled in order): the client's changes are synced
    z.object({ type: z.literal("ack-request"), id: z.number() }),
]);

export type DraftClientMessage = z.infer<typeof draftClientMessageSchema>;

export type DraftServerMessage =
    // the answer to "sync": what the client doesn't have yet
    | { type: "synced"; update: string }
    // a change of the server's document (by another form, an AI assistant, publishing, the stored todo changing)
    | { type: "update"; update: string }
    | { type: "peers"; peers: DraftPeer[] }
    | { type: "ack"; id: number }
    // the todo was deleted
    | { type: "deleted" };

export function isDraftServerMessage(message: unknown): message is DraftServerMessage {
    return (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        ["synced", "update", "peers", "ack", "deleted"].includes(String(message.type))
    );
}

export function toBase64(bytes: Uint8Array) {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

export function fromBase64(base64: string) {
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
