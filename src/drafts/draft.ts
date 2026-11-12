import * as Y from "yjs";
import { z } from "zod";

// Shared drafts (live editing of forms): everyone who has an entity's form open edits the same draft of it and sees the others'
// changes as they type, their cursors and the field they are on; the AI assistants (chat, MCP server) edit it too. The entity itself
// only changes when the draft is published. Generic: a form gets it with a draft definition (defineDraft) and its server part
// (serverDraft, drafts.server.ts); the form uses useDraftForm and the draft fields (DraftFields.tsx).
//
// The draft is a Yjs document (CRDT): concurrent edits merge, also in the same text field (text fields are Y.Text, typed character
// by character), and the cursors of the others are relative positions in these texts, so they stay at their place while the text
// changes. The document holds
// - "draft": the form's values (text fields as Y.Text, the other fields as plain values: the last change wins),
// - "published": the entity as stored (the state the draft started from, updated after it was published or changed elsewhere), to
//   tell which fields the draft changes.
// Shared by the draft's Durable Object (draftAgent.server.ts), the server's operations (drafts.server.ts) and the forms (draftSession.ts).

// The value of a field (compared with ===, so changes are told by value)
export type DraftValue = string | number | boolean | null;

// The fields of a form: an object type of DraftValues (a type alias, not an interface)
export type DraftValues = Record<string, DraftValue>;

// text: typed character by character into a Y.Text (concurrent typing merges, cursors are shown), only for string fields;
// value: replaced as a whole (e.g. a date, a select, a checkbox)
export type DraftFieldKind = "text" | "value";

export type DraftFieldKinds<Values extends DraftValues> = {
    [Field in keyof Values]-?: [Values[Field]] extends [string]
        ? DraftFieldKind
        : // any field (DraftValues itself, e.g. the Durable Object, which serves all drafts)
          DraftValue extends Values[Field]
          ? DraftFieldKind
          : "value";
};

// The fields of a draft that are text fields
export type DraftTextField<Values extends DraftValues> = {
    [Field in keyof Values]-?: Values[Field] extends string ? Field : never;
}[keyof Values] &
    string;

// A kind of draft (e.g. the todo form's): plain data, also passed to the draft's Durable Object
export type DraftDefinition<Values extends DraftValues> = {
    // unique among the app's drafts (part of the Durable Object's name)
    name: string;
    fields: DraftFieldKinds<Values>;
};

// e.g. defineDraft<TodoDraftValues>({ name: "todo", fields: { title: "text", done: "value", ... } })
export function defineDraft<Values extends DraftValues>(definition: DraftDefinition<Values>): DraftDefinition<Values> {
    return definition;
}

export function draftFields<Values extends DraftValues>(definition: DraftDefinition<Values>) {
    return Object.keys(definition.fields) as (keyof Values & string)[];
}

function isTextField<Values extends DraftValues>(definition: DraftDefinition<Values>, field: keyof Values) {
    return definition.fields[field] === "text";
}

// The draft's values of an object that has (at least) the draft's fields, e.g. an entity as stored
export function pickDraftValues<Values extends DraftValues>(definition: DraftDefinition<Values>, object: Values): Values {
    return Object.fromEntries(draftFields(definition).map((field) => [field, object[field]])) as unknown as Values;
}

function draftMap(doc: Y.Doc) {
    return doc.getMap<unknown>("draft");
}

function publishedMap(doc: Y.Doc) {
    return doc.getMap<unknown>("published");
}

// The Y.Text of a text field (created by initDraft)
export function draftText(doc: Y.Doc, field: string): Y.Text | undefined {
    const text = draftMap(doc).get(field);
    return text instanceof Y.Text ? text : undefined;
}

// Whether the document holds a draft (initDraft ran, here or on the server the document was synced with)
export function hasDraft(doc: Y.Doc) {
    return publishedMap(doc).size > 0;
}

function readValues<Values extends DraftValues>(definition: DraftDefinition<Values>, map: Y.Map<unknown>): Values {
    return Object.fromEntries(
        draftFields(definition).map((field) => {
            const item = map.get(field);
            if (item instanceof Y.Text) {
                return [field, item.toString()];
            }
            return [field, item === undefined ? (isTextField(definition, field) ? "" : null) : item];
        }),
    ) as Values;
}

export function readDraft<Values extends DraftValues>(definition: DraftDefinition<Values>, doc: Y.Doc): Values {
    return readValues(definition, draftMap(doc));
}

export function readPublished<Values extends DraftValues>(definition: DraftDefinition<Values>, doc: Y.Doc): Values {
    return readValues(definition, publishedMap(doc));
}

// The fields whose draft value differs from the published one: the changes publishing saves
export function changedFields<Values extends DraftValues>(definition: DraftDefinition<Values>, draft: Values, published: Values) {
    return draftFields(definition).filter((field) => draft[field] !== published[field]);
}

// Starts the draft from the stored entity (on the server, once per entity)
export function initDraft<Values extends DraftValues>(definition: DraftDefinition<Values>, doc: Y.Doc, stored: Values) {
    doc.transact(() => {
        const draft = draftMap(doc);
        for (const field of draftFields(definition)) {
            draft.set(field, isTextField(definition, field) ? new Y.Text(String(stored[field] ?? "")) : stored[field]);
        }
        setPublished(definition, doc, stored);
    });
}

function setPublished<Values extends DraftValues>(definition: DraftDefinition<Values>, doc: Y.Doc, stored: Values) {
    const published = publishedMap(doc);
    for (const field of draftFields(definition)) {
        if (published.get(field) !== stored[field]) {
            published.set(field, stored[field]);
        }
    }
}

// Changes fields of the draft (the form, the AI assistants, discarding). A text field is changed by its difference to the current
// text (applyTextChange), so the others' cursors and their concurrent typing elsewhere in the text are kept.
export function setDraftValues<Values extends DraftValues>(
    definition: DraftDefinition<Values>,
    doc: Y.Doc,
    values: Partial<Values>,
    origin?: unknown,
) {
    doc.transact(() => {
        const draft = draftMap(doc);
        for (const field of draftFields(definition)) {
            const value = values[field];
            if (value === undefined) {
                continue;
            }
            const text = isTextField(definition, field) ? draftText(doc, field) : undefined;
            if (text) {
                applyTextChange(text, String(value ?? ""));
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

// The stored entity changed (published, or changed elsewhere, e.g. in a grid): the fields the draft doesn't change follow it, the
// draft's changes are kept. Fields whose draft value was just published (`publishedDraft`, before the save normalized it, e.g.
// trimmed a title) follow it too.
export function rebaseDraft<Values extends DraftValues>(definition: DraftDefinition<Values>, doc: Y.Doc, stored: Values, publishedDraft?: Values) {
    doc.transact(() => {
        const draft = readDraft(definition, doc);
        const published = readPublished(definition, doc);
        const follow = draftFields(definition).filter(
            (field) => draft[field] === published[field] || (publishedDraft !== undefined && draft[field] === publishedDraft[field]),
        );
        setDraftValues(definition, doc, Object.fromEntries(follow.map((field) => [field, stored[field]])) as Partial<Values>);
        setPublished(definition, doc, stored);
    });
}

// Discards the draft's changes (for everyone): the draft is the published entity again
export function discardDraft<Values extends DraftValues>(definition: DraftDefinition<Values>, doc: Y.Doc, origin?: unknown) {
    setDraftValues(definition, doc, readPublished(definition, doc), origin);
}

// The protocol between a form and the draft's Durable Object: JSON messages on the WebSocket (besides the Agents SDK's own messages),
// Yjs updates as base64

// Where a form is (a field and, in a text field, the selection as Yjs relative positions, JSON), shown to the others as cursor
export const draftPresenceSchema = z.object({
    field: z.string().max(100),
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
    // a change of the server's document (by another form, an AI assistant, publishing, the stored entity changing)
    | { type: "update"; update: string }
    | { type: "peers"; peers: DraftPeer[] }
    | { type: "ack"; id: number }
    // the entity was deleted
    | { type: "deleted" };

const serverMessageTypes = new Set<string>(["synced", "update", "peers", "ack", "deleted"] satisfies DraftServerMessage["type"][]);

export function isDraftServerMessage(message: unknown): message is DraftServerMessage {
    return typeof message === "object" && message !== null && "type" in message && serverMessageTypes.has(String(message.type));
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
