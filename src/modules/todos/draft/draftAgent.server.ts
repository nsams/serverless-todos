import { Agent, type Connection, type ConnectionContext, getAgentByName, type WSMessage } from "agents";
import { env } from "cloudflare:workers";
import * as Y from "yjs";

import {
    changedFields,
    draftClientMessageSchema,
    type DraftPeer,
    type DraftPresence,
    type DraftServerMessage,
    fromBase64,
    hasDraft,
    initDraft,
    readDraft,
    readPublished,
    rebaseDraft,
    setDraftValues,
    toBase64,
    type TodoDraftValues,
} from "./draft";

// The shared draft of a todo (draft.ts): a Durable Object per todo (instance name = todo id), reached only through the worker, which
// checks that the todo belongs to the user first (the WebSocket route in api.server.ts, the operations). It keeps the draft's Yjs
// document in its storage, syncs it with the forms (WebSocket, hibernating) and tells each form where the others are (cursors).
// The operations change it over RPC: the AI assistants' edits, publishing, the stored todo changing elsewhere. It never reads or
// writes the database itself: the worker passes the stored todo.

// The authenticated user of a WebSocket connection, set by the worker on the forwarded request (the client can't reach the object directly)
export const draftUserHeader = "x-todo-draft-user";

const storageKey = "doc";

// The cursor colors of the others (readable on light and dark backgrounds)
const peerColors = ["#e91e63", "#9c27b0", "#3f51b5", "#0288d1", "#00897b", "#689f38", "#f57c00", "#6d4c41"];

type ConnectionState = { name: string; color: string; presence: DraftPresence | null };

// What the operations get to see of the draft
export type TodoDraftState = { draft: TodoDraftValues; published: TodoDraftValues; changedFields: (keyof TodoDraftValues)[] };

export class TodoDraft extends Agent<Env> {
    #doc: Y.Doc | undefined;

    // The draft's document, loaded from the storage on first use (also after hibernation); every change is stored and sent to the
    // forms (except the one it came from: the origin is the connection's id)
    get doc(): Y.Doc {
        if (!this.#doc) {
            const doc = new Y.Doc();
            const stored = this.ctx.storage.kv.get<Uint8Array>(storageKey);
            if (stored) {
                Y.applyUpdate(doc, stored);
            }
            doc.on("update", (update: Uint8Array, origin: unknown) => {
                this.ctx.storage.kv.put(storageKey, Y.encodeStateAsUpdate(doc));
                const message = JSON.stringify({ type: "update", update: toBase64(update) } satisfies DraftServerMessage);
                this.broadcast(message, typeof origin === "string" ? [origin] : undefined);
            });
            this.#doc = doc;
        }
        return this.#doc;
    }

    // RPC (the worker, before forwarding a form's WebSocket): starts the draft from the stored todo, or takes over the stored todo's
    // changes (rebaseDraft)
    async openDraft(todo: TodoDraftValues): Promise<void> {
        if (hasDraft(this.doc)) {
            rebaseDraft(this.doc, todo);
        } else {
            initDraft(this.doc, todo);
        }
    }

    // RPC: the draft (e.g. to publish it)
    async getDraft(todo: TodoDraftValues): Promise<TodoDraftState> {
        await this.openDraft(todo);
        return this.snapshot();
    }

    // RPC (an AI assistant): changes fields of the draft, the forms show it right away
    async updateDraft(todo: TodoDraftValues, values: Partial<TodoDraftValues>): Promise<TodoDraftState> {
        await this.openDraft(todo);
        setDraftValues(this.doc, values);
        return this.snapshot();
    }

    // RPC: the stored todo changed (published: `publishedDraft` is the draft that was published; or changed elsewhere, e.g. in the
    // list's grid). Nothing to do if there's no draft yet (it starts from the stored todo).
    async todoStored(todo: TodoDraftValues, publishedDraft?: TodoDraftValues): Promise<void> {
        if (hasDraft(this.doc)) {
            rebaseDraft(this.doc, todo, publishedDraft);
        }
    }

    // RPC: the todo was deleted: the forms say so, the draft is gone
    async todoDeleted(): Promise<void> {
        this.broadcast(JSON.stringify({ type: "deleted" } satisfies DraftServerMessage));
        for (const connection of this.getConnections()) {
            connection.close(1000, "Todo deleted");
        }
        this.#doc?.destroy();
        this.#doc = undefined;
        this.ctx.storage.kv.delete(storageKey);
    }

    private snapshot(): TodoDraftState {
        const draft = readDraft(this.doc);
        const published = readPublished(this.doc);
        return { draft, published, changedFields: changedFields(draft, published) };
    }

    override onConnect(connection: Connection<ConnectionState>, { request }: ConnectionContext) {
        const name = request.headers.get(draftUserHeader) ?? "Unknown";
        connection.setState({ name, color: peerColors[hash(connection.id) % peerColors.length], presence: null });
        this.sendPeers();
    }

    override onClose(connection: Connection) {
        this.sendPeers(connection.id);
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
                    this.sendPeers(undefined, connection.id);
                }
                break;
            }
            case "ack-request":
                send({ type: "ack", id: message.id });
                break;
        }
    }

    // Tells every form who else is on the draft and where. closed: the connection that is closing; changed: only the presence of this
    // connection changed (it doesn't need to know)
    private sendPeers(closed?: string, changed?: string) {
        const connections = [...this.getConnections<ConnectionState>()].filter((connection) => connection.id !== closed && connection.state);
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

function hash(value: string) {
    let result = 0;
    for (const char of value) {
        result = (result * 31 + char.charCodeAt(0)) >>> 0;
    }
    return result;
}

// The draft of a todo. Only for a todo the worker has checked belongs to the user.
export function getTodoDraft(todoId: string) {
    return getAgentByName(env.TodoDraft, todoId);
}
