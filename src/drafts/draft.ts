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

// text: typed character by character into a Y.Text (concurrent typing merges, cursors are shown), only for fields of type string
// (not for string literal unions or nullable strings: merged concurrent edits could be any string); value: replaced as a whole (e.g.
// a date, a select, a checkbox)
export type DraftFieldKind = "text" | "value";

// The fields that can be text fields: of type string
type TextFieldCandidate<Values extends DraftValues> = {
    [Field in keyof Values]-?: [Values[Field]] extends [string] ? (string extends Values[Field] ? Field : never) : never;
}[keyof Values] &
    string;

export type DraftFieldKinds<Values extends DraftValues> = {
    [Field in keyof Values]-?: Field extends TextFieldCandidate<Values>
        ? DraftFieldKind
        : // any field (DraftValues itself)
          DraftValue extends Values[Field]
          ? DraftFieldKind
          : "value";
};

// A kind of draft (e.g. the todo form's), created with defineDraft. TextField: the fields declared as text fields (only these can be
// edited with DraftTextField).
export type DraftDefinition<Values extends DraftValues, TextField extends string = string> = DraftDefinitionData & {
    fields: DraftFieldKinds<Values>;
    // type only
    readonly __textFields?: TextField;
};

// A draft definition as plain data (also passed to the draft's Durable Object, which serves all drafts)
export type DraftDefinitionData = {
    // unique among the app's drafts (part of the Durable Object's name)
    name: string;
    fields: Record<string, DraftFieldKind>;
};

// The text fields of a draft definition
export type DraftTextFieldOf<Definition> = Definition extends DraftDefinition<DraftValues, infer TextField> ? TextField : never;

// A draft: its name and fields, the kind of each field (all fields of Values, no others), e.g.
//
//     defineDraft<TodoDraftValues>()({ name: "todo", fields: { title: "text", description: "text", dueDate: "value", ... } })
//
// (curried: Values is given, the kinds are inferred, so the text fields are known to the types)
export function defineDraft<Values extends DraftValues>() {
    return <const Kinds extends DraftFieldKinds<Values>>(definition: {
        name: string;
        fields: Kinds & Record<Exclude<keyof Kinds, keyof Values>, never>;
    }) => definition as DraftDefinition<Values, { [Field in keyof Kinds]: Kinds[Field] extends "text" ? Field : never }[keyof Kinds] & string>;
}

export function draftFields<Values extends DraftValues>(definition: DraftDefinition<Values>) {
    return Object.keys(definition.fields) as (keyof Values & string)[];
}

function isTextField<Values extends DraftValues>(definition: DraftDefinition<Values>, field: keyof Values & string) {
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

// The definition changed since the draft was started: fields that were added start from the stored entity (draft and published),
// text fields become Y.Text (e.g. a value field that became a text field), with their current value. Only on the server (before any
// form syncs), so no two forms create competing Y.Texts.
export function ensureFields<Values extends DraftValues>(definition: DraftDefinition<Values>, doc: Y.Doc, stored: Values) {
    const draft = draftMap(doc);
    const published = publishedMap(doc);
    const fields = draftFields(definition);
    const added = fields.filter((field) => !published.has(field));
    const notText = fields.filter((field) => isTextField(definition, field) && !(draft.get(field) instanceof Y.Text));
    if (added.length === 0 && notText.length === 0) {
        return;
    }
    doc.transact(() => {
        for (const field of added) {
            published.set(field, stored[field]);
            draft.set(field, isTextField(definition, field) ? new Y.Text(String(stored[field] ?? "")) : stored[field]);
        }
        for (const field of notText.filter((field) => !added.includes(field))) {
            draft.set(field, new Y.Text(String(draft.get(field) ?? stored[field] ?? "")));
        }
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
            if (isTextField(definition, field)) {
                const text = draftText(doc, field);
                if (text) {
                    applyTextChange(text, String(value ?? ""));
                } else {
                    // (only before ensureFields ran, i.e. never: the server ensures them before anyone edits)
                    draft.set(field, new Y.Text(String(value ?? "")));
                }
            } else if (draft.get(field) !== value) {
                draft.set(field, value);
            }
        }
    }, origin);
}

// Where a text changed, as the input's cursor tells it: the change starts at `start` (the selection's start before the change, or the
// cursor after it, whichever is smaller). Only decides between equally small changes: an insertion or deletion among repeated
// characters (e.g. typing "a" in front of "aab" inserts at 0, not at 2).
export type TextChangeHint = { start: number };

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

// Changes a text to a new value by deleting and inserting only the part in between the common prefix and suffix (e.g. a typed
// character is one insertion at the cursor). The boundaries are whole characters: a surrogate pair (e.g. an emoji) is never split
// (Yjs would replace its halves with U+FFFD).
export function applyTextChange(text: Y.Text, value: string, hint?: TextChangeHint) {
    const current = text.toString();
    if (current === value) {
        return;
    }
    const minLength = Math.min(current.length, value.length);
    let prefix = 0;
    while (prefix < minLength && current[prefix] === value[prefix]) {
        prefix++;
    }
    let suffix = 0;
    while (suffix < minLength && current[current.length - 1 - suffix] === value[value.length - 1 - suffix]) {
        suffix++;
    }
    let start = prefix;
    let end = Math.min(suffix, minLength - prefix);
    if (prefix + suffix >= minLength) {
        // a pure insertion or deletion, anywhere from minLength - suffix to prefix: where the cursor says
        start = Math.max(minLength - suffix, Math.min(prefix, hint?.start ?? prefix));
        end = minLength - start;
    }
    if (start > 0 && isHighSurrogate(current.charCodeAt(start - 1))) {
        start--;
    }
    if (end > 0 && isLowSurrogate(current.charCodeAt(current.length - end))) {
        end--;
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

// The stored entity changed (changed elsewhere, e.g. in a grid, or published): the fields the draft doesn't change follow it, the
// draft's changes are kept. base: what the draft is compared with, by default the published entity; after publishing, the draft that
// was published, so the fields that weren't changed since publishing read the draft follow the saved entity (e.g. a trimmed title),
// and a field changed in the meantime stays a change, also one changed back to the old value.
export function rebaseDraft<Values extends DraftValues>(definition: DraftDefinition<Values>, doc: Y.Doc, stored: Values, base?: Values) {
    doc.transact(() => {
        const draft = readDraft(definition, doc);
        const compared = base ?? readPublished(definition, doc);
        const follow = draftFields(definition).filter((field) => draft[field] === compared[field]);
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
