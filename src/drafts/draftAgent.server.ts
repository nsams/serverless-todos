import { Agent, type Connection, type ConnectionContext, type WSMessage } from "agents";
import * as Y from "yjs";

import { denySubAgent } from "~/agents.server";

import {
    changedFields,
    draftClientMessageSchema,
    type DraftDefinition,
    type DraftDefinitionData,
    draftFields,
    type DraftPeer,
    type DraftPresence,
    type DraftServerMessage,
    type DraftValues,
    ensureFields,
    fromBase64,
    hasDraft,
    initDraft,
    readDraft,
    readPublished,
    rebaseDraft,
    setDraftValues,
    toBase64,
} from "./draft";

// The shared draft of an entity (draft.ts): a Durable Object per entity (instance name: "<draft name>:<entity id>"), one class for all
// drafts of the app. Reached only through the worker (drafts.server.ts), which checks that the entity belongs to the user first. It
// keeps the draft's Yjs document in its storage, syncs it with the forms (WebSocket, hibernating) and tells each form where the others
// are (cursors). The worker changes it over RPC: the AI assistants' edits, publishing, the stored entity changing elsewhere. It never
// reads or writes the database: the worker passes the stored entity with its revision (snapshots loaded earlier can arrive later:
// older ones are ignored) and the draft's definition (which fields are text fields).

// The authenticated user of a WebSocket connection, set by the worker on the forwarded request (the client can't reach the object directly)
export const draftUserHeader = "x-draft-user";

// storage (synchronous KV): the document, the revision of the stored entity it last took over, the deletion of the entity
const docKey = "doc";
const revisionKey = "revision";
const deletedKey = "deleted";
// the draft being published (between reading it and the save's notification)
const publishingKey = "publishing";

// A publish that didn't finish (e.g. the worker failed) is forgotten after this time
const publishingTimeout = 60_000;

type Publishing = { draft: DraftValues; fields: string[]; at: number };

// The cursor colors of the others (readable on light and dark backgrounds)
const peerColors = ["#e91e63", "#9c27b0", "#3f51b5", "#0288d1", "#00897b", "#689f38", "#f57c00", "#6d4c41"];

type ConnectionState = { name: string; color: string; presence: DraftPresence | null };

// What the worker gets to see of the draft; null: the entity was deleted
export type DraftState<Values extends DraftValues> = { draft: Values; published: Values; changedFields: (keyof Values & string)[] } | null;

export class DraftAgent extends Agent<Env> {
    #doc: Y.Doc | undefined;

    // The draft's document, loaded from the storage on first use (also after hibernation); every change is stored and sent to the
    // forms (except the one it came from: the origin is the connection's id)
    get doc(): Y.Doc {
        if (!this.#doc) {
            const doc = new Y.Doc();
            const stored = this.ctx.storage.kv.get<Uint8Array>(docKey);
            if (stored) {
                Y.applyUpdate(doc, stored);
            }
            doc.on("update", (update: Uint8Array, origin: unknown) => {
                if (this.#deleted) {
                    return;
                }
                this.ctx.storage.kv.put(docKey, Y.encodeStateAsUpdate(doc));
                const message = JSON.stringify({ type: "update", update: toBase64(update) } satisfies DraftServerMessage);
                this.broadcast(message, typeof origin === "string" ? [origin] : undefined);
            });
            this.#doc = doc;
        }
        return this.#doc;
    }

    get #deleted() {
        return this.ctx.storage.kv.get<boolean>(deletedKey) === true;
    }

    // Starts the draft from the stored entity, or takes over the stored entity's changes the draft may have missed (rebaseDraft), unless
    // the snapshot is older than one taken over before. false: the entity was deleted.
    #open(definition: DraftDefinitionData, stored: DraftValues, revision: number) {
        if (this.#deleted) {
            return false;
        }
        const typed = definition as DraftDefinition<DraftValues>;
        if (!hasDraft(this.doc)) {
            initDraft(typed, this.doc, stored);
            this.ctx.storage.kv.put(revisionKey, revision);
        } else {
            ensureFields(typed, this.doc, stored);
            this.#takeOver(typed, stored, revision);
        }
        return true;
    }

    // Takes over a snapshot of the stored entity newer than the last one (rebaseDraft). publishedDraft: the snapshot is the one saved
    // by publishing this draft (the same revision as a snapshot loaded right after the save: the published fields still follow it).
    #takeOver(definition: DraftDefinition<DraftValues>, stored: DraftValues, revision: number, publishedDraft?: DraftValues) {
        const current = this.ctx.storage.kv.get<number>(revisionKey) ?? -Infinity;
        if (revision > current || (revision === current && publishedDraft)) {
            rebaseDraft(definition, this.doc, stored, publishedDraft ?? this.#publishingBase(definition, stored));
            this.ctx.storage.kv.put(revisionKey, revision);
        }
        if (publishedDraft) {
            this.ctx.storage.kv.delete(publishingKey);
        }
    }

    // While a publish is under way, a snapshot of its save can arrive before its notification (e.g. a form connecting right after the
    // save): the fields it published and the save changed are compared with the draft that was published, not with the old published
    // value (an edit made in the meantime stays a change, also one back to the old value)
    #publishingBase(definition: DraftDefinition<DraftValues>, stored: DraftValues): DraftValues | undefined {
        const publishing = this.ctx.storage.kv.get<Publishing>(publishingKey);
        if (!publishing || Date.now() - publishing.at > publishingTimeout) {
            return undefined;
        }
        const published = readPublished(definition, this.doc);
        return Object.fromEntries(
            draftFields(definition).map((field) => [
                field,
                publishing.fields.includes(field) && stored[field] !== published[field] ? publishing.draft[field] : published[field],
            ]),
        );
    }

    // RPC (the worker, before forwarding a form's WebSocket): opens the draft. false: the entity was deleted.
    async openDraft(definition: DraftDefinitionData, stored: DraftValues, revision: number): Promise<boolean> {
        return this.#open(definition, stored, revision);
    }

    // RPC: the draft
    async getDraft(definition: DraftDefinitionData, stored: DraftValues, revision: number): Promise<DraftState<DraftValues>> {
        return this.#open(definition, stored, revision) ? this.#state(definition) : null;
    }

    // RPC: the draft to publish; the publish ends with entityStored(…, publishedDraft) after the save, or with publishFailed
    async startPublish(definition: DraftDefinitionData, stored: DraftValues, revision: number): Promise<DraftState<DraftValues>> {
        const state = this.#open(definition, stored, revision) ? this.#state(definition) : null;
        if (state && state.changedFields.length > 0) {
            this.ctx.storage.kv.put(publishingKey, { draft: state.draft, fields: state.changedFields, at: Date.now() } satisfies Publishing);
        }
        return state;
    }

    // RPC: the publish failed (e.g. invalid input): nothing was saved
    async publishFailed(): Promise<void> {
        this.ctx.storage.kv.delete(publishingKey);
    }

    // RPC (e.g. an AI assistant): changes fields of the draft, the forms show it right away
    async updateDraft(
        definition: DraftDefinitionData,
        stored: DraftValues,
        revision: number,
        values: Partial<DraftValues>,
    ): Promise<DraftState<DraftValues>> {
        if (!this.#open(definition, stored, revision)) {
            return null;
        }
        setDraftValues(definition as DraftDefinition<DraftValues>, this.doc, values);
        return this.#state(definition);
    }

    // RPC: the stored entity changed (published: `publishedDraft` is the draft that was published; or changed elsewhere, e.g. in a
    // grid). Without a draft yet, it starts from this snapshot (a snapshot loaded before this save may arrive later: it's older).
    async entityStored(definition: DraftDefinitionData, stored: DraftValues, revision: number, publishedDraft?: DraftValues): Promise<void> {
        if (this.#deleted) {
            return;
        }
        const typed = definition as DraftDefinition<DraftValues>;
        if (!hasDraft(this.doc)) {
            initDraft(typed, this.doc, stored);
            this.ctx.storage.kv.put(revisionKey, revision);
            return;
        }
        ensureFields(typed, this.doc, stored);
        this.#takeOver(typed, stored, revision, publishedDraft);
    }

    // RPC: the entity was deleted: the forms say so, the draft is gone. The deletion is kept (a snapshot loaded before it, e.g. of a
    // form connecting at the same time, mustn't start the draft again).
    async entityDeleted(): Promise<void> {
        this.ctx.storage.kv.put(deletedKey, true);
        this.ctx.storage.kv.delete(docKey);
        this.ctx.storage.kv.delete(revisionKey);
        this.ctx.storage.kv.delete(publishingKey);
        this.#doc?.destroy();
        this.#doc = undefined;
        for (const connection of this.getConnections()) {
            closeDeleted(connection);
        }
    }

    #state(definition: DraftDefinitionData): DraftState<DraftValues> {
        const typed = definition as DraftDefinition<DraftValues>;
        const draft = readDraft(typed, this.doc);
        const published = readPublished(typed, this.doc);
        return { draft, published, changedFields: changedFields(typed, draft, published) };
    }

    // no sub-agents
    override async onBeforeSubAgent() {
        return denySubAgent();
    }

    override onConnect(connection: Connection<ConnectionState>, { request }: ConnectionContext) {
        // deleted after the worker opened the draft
        if (this.#deleted) {
            closeDeleted(connection);
            return;
        }
        const name = request.headers.get(draftUserHeader) ?? "Unknown";
        connection.setState({ name, color: peerColors[hash(connection.id) % peerColors.length], presence: null });
        this.#sendPeers();
    }

    override onClose() {
        this.#sendPeers();
    }

    override onMessage(connection: Connection<ConnectionState>, raw: WSMessage) {
        if (typeof raw !== "string") {
            return;
        }
        let json: unknown;
        try {
            json = JSON.parse(raw);
        } catch {
            return;
        }
        // other messages are the Agents SDK's (e.g. state sync, not used here)
        const parsed = draftClientMessageSchema.safeParse(json);
        if (!parsed.success) {
            return;
        }
        if (this.#deleted) {
            // (messages sent before the client learned about it)
            closeDeleted(connection);
            return;
        }
        const message = parsed.data;
        const send = (reply: DraftServerMessage) => connection.send(JSON.stringify(reply));
        switch (message.type) {
            case "sync":
                // the client's changes made while disconnected, then what the client is missing
                Y.applyUpdate(this.doc, fromBase64(message.update), connection.id);
                send({ type: "synced", update: toBase64(Y.encodeStateAsUpdate(this.doc, fromBase64(message.stateVector))) });
                break;
            case "update":
                Y.applyUpdate(this.doc, fromBase64(message.update), connection.id);
                break;
            case "presence": {
                const state = connection.state;
                if (state) {
                    connection.setState({ ...state, presence: message.presence });
                    this.#sendPeers(connection.id);
                }
                break;
            }
            case "ack-request":
                send({ type: "ack", id: message.id });
                break;
        }
    }

    // Tells every form who else is on the draft and where. changed: only the presence of this connection changed (it doesn't need to
    // know). Only open connections (not one that is closing: a reconnecting client can have a new connection with the same id).
    #sendPeers(changed?: string) {
        const connections = [...this.getConnections<ConnectionState>()].filter(
            (connection) => connection.readyState === WebSocket.OPEN && connection.state,
        );
        for (const recipient of connections) {
            if (recipient.id === changed) {
                continue;
            }
            const peers: DraftPeer[] = connections
                .filter((connection) => connection.id !== recipient.id)
                .map(({ id, state }) => ({
                    id,
                    name: state?.name ?? "",
                    self: state?.name === recipient.state?.name,
                    color: state?.color ?? peerColors[0],
                    presence: state?.presence ?? null,
                }));
            recipient.send(JSON.stringify({ type: "peers", peers } satisfies DraftServerMessage));
        }
    }
}

// The terminal close of a form's connection when its entity was deleted (4xxx: the client doesn't reconnect)
export const deletedCloseCode = 4404;

function closeDeleted(connection: Connection) {
    if (connection.readyState !== WebSocket.OPEN) {
        return;
    }
    connection.send(JSON.stringify({ type: "deleted" } satisfies DraftServerMessage));
    connection.close(deletedCloseCode, "Deleted");
}

function hash(value: string) {
    let result = 0;
    for (const char of value) {
        result = (result * 31 + char.charCodeAt(0)) >>> 0;
    }
    return result;
}
