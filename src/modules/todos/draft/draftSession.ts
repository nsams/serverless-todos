import { AgentClient } from "agents/client";
import * as Y from "yjs";

import {
    discardDraft,
    type DraftClientMessage,
    type DraftPeer,
    type DraftPresence,
    draftText,
    fromBase64,
    hasDraft,
    isDraftServerMessage,
    readDraft,
    readPublished,
    setDraftValues,
    toBase64,
    type TodoDraftTextField,
    type TodoDraftValues,
} from "./draft";

// The form's connection to a todo's draft (draft.ts, the draft's Durable Object: draftAgent.server.ts): a local copy of the draft's
// Yjs document, synced over a WebSocket (reconnects by itself). The form edits the local copy, the changes are sent right away; what
// others change arrives as updates. Local changes made while disconnected are synced after reconnecting.
//
// Changes that aren't synced yet (e.g. the network is slow or gone) are the only ones that can get lost: while there are any, reloading
// or closing the tab asks for confirmation (the browser's beforeunload dialog), and a session the form doesn't use anymore (the user
// navigated elsewhere) stays connected until they are synced.

export type DraftSnapshot = {
    // the first sync is done: the draft is there and can be edited
    ready: boolean;
    connected: boolean;
    // local changes the server doesn't have yet
    unsynced: boolean;
    // the todo was deleted
    deleted: boolean;
    values: TodoDraftValues;
    published: TodoDraftValues;
    // the others on the draft and where they are
    peers: DraftPeer[];
};

// The origin of the server's updates applied to the local document (local changes have none)
const remote = Symbol("remote");

export class DraftSession {
    readonly doc = new Y.Doc();
    readonly #socket: AgentClient;
    #listeners = new Set<() => void>();
    #snapshot: DraftSnapshot;
    #synced = false;
    #connected = false;
    #deleted = false;
    #peers: DraftPeer[] = [];
    #presence: DraftPresence | null = null;
    // local changes, counted; acknowledged by the server (ack-request, answered in order after the changes sent before)
    #localVersion = 0;
    #ackedVersion = 0;
    // called when the published todo changed (published or changed elsewhere, also by others)
    onPublishedChange?: () => void;

    constructor(path: string) {
        this.#socket = new AgentClient({
            agent: "TodoDraft",
            // the worker picks the draft by the todo in the path, after checking that it is the user's
            basePath: path.replace(/^\//, ""),
            host: window.location.host,
            protocol: window.location.protocol === "https:" ? "wss" : "ws",
        });
        this.#socket.addEventListener("open", () => {
            this.#connected = true;
            // the local changes made while disconnected (all of the document: the server only takes what it doesn't have)
            this.#send({ type: "sync", update: toBase64(Y.encodeStateAsUpdate(this.doc)), stateVector: toBase64(Y.encodeStateVector(this.doc)) });
            this.#requestAck();
            if (this.#presence) {
                this.#send({ type: "presence", presence: this.#presence });
            }
            this.#emit();
        });
        this.#socket.addEventListener("close", () => {
            this.#connected = false;
            this.#peers = [];
            this.#emit();
        });
        this.#socket.addEventListener("message", (event: MessageEvent) => this.#handleMessage(event.data));
        this.doc.on("update", (update: Uint8Array, origin: unknown) => {
            if (origin !== remote) {
                this.#localVersion++;
                this.#send({ type: "update", update: toBase64(update) });
                this.#requestAck();
            }
            this.#emit();
        });
        this.#snapshot = this.#createSnapshot();
    }

    #handleMessage(data: unknown) {
        if (typeof data !== "string") {
            return;
        }
        let message: unknown;
        try {
            message = JSON.parse(data);
        } catch {
            return;
        }
        // other messages are the Agents SDK's (e.g. the identity)
        if (!isDraftServerMessage(message)) {
            return;
        }
        switch (message.type) {
            case "synced":
            case "update": {
                const hadDraft = hasDraft(this.doc);
                const published = JSON.stringify(readPublished(this.doc));
                Y.applyUpdate(this.doc, fromBase64(message.update), remote);
                if (message.type === "synced") {
                    this.#synced = true;
                }
                if (hadDraft && JSON.stringify(readPublished(this.doc)) !== published) {
                    this.onPublishedChange?.();
                }
                break;
            }
            case "peers":
                this.#peers = message.peers;
                break;
            case "ack":
                this.#ackedVersion = Math.max(this.#ackedVersion, message.id);
                break;
            case "deleted":
                this.#deleted = true;
                // (the server closes the connection too; not reconnecting: the todo is gone)
                this.#socket.close();
                break;
        }
        this.#emit();
    }

    // Sent only while connected (not queued: after reconnecting, the sync sends all changes)
    #send(message: DraftClientMessage) {
        if (this.#socket.readyState === WebSocket.OPEN) {
            this.#socket.send(JSON.stringify(message));
        }
    }

    #requestAck() {
        this.#send({ type: "ack-request", id: this.#localVersion });
    }

    #createSnapshot(): DraftSnapshot {
        return {
            ready: this.#synced && hasDraft(this.doc) && !this.#deleted,
            connected: this.#connected,
            unsynced: this.#localVersion > this.#ackedVersion,
            deleted: this.#deleted,
            values: readDraft(this.doc),
            published: readPublished(this.doc),
            peers: this.#peers,
        };
    }

    #emit() {
        this.#snapshot = this.#createSnapshot();
        for (const listener of this.#listeners) {
            listener();
        }
    }

    // for useSyncExternalStore
    subscribe = (listener: () => void) => {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    };

    getSnapshot = () => this.#snapshot;

    setValues(values: Partial<TodoDraftValues>) {
        setDraftValues(this.doc, values);
    }

    // Discards the draft's changes, for everyone
    discard() {
        discardDraft(this.doc);
    }

    text(field: TodoDraftTextField) {
        return draftText(this.doc, field);
    }

    // Where the form is (focused field, selection), shown to the others
    setPresence(presence: DraftPresence | null) {
        if (JSON.stringify(presence) === JSON.stringify(this.#presence)) {
            return;
        }
        this.#presence = presence;
        this.#send({ type: "presence", presence });
    }

    close() {
        this.#socket.close();
        this.doc.destroy();
    }
}

// The sessions by todo, shared by the forms of a todo (e.g. React's StrictMode mounts twice); a session is closed when no form uses it
// anymore and its changes are synced
const sessions = new Map<string, { session: DraftSession; users: number }>();

export function acquireDraftSession(todoId: string, path: string) {
    let entry = sessions.get(todoId);
    if (!entry) {
        entry = { session: new DraftSession(path), users: 0 };
        sessions.set(todoId, entry);
    }
    entry.users++;
    return entry.session;
}

export function releaseDraftSession(todoId: string) {
    const entry = sessions.get(todoId);
    if (!entry || --entry.users > 0) {
        return;
    }
    const { session } = entry;
    session.setPresence(null);
    const closeWhenSynced = () => {
        // used again in the meantime
        if (sessions.get(todoId) !== entry || entry.users > 0) {
            unsubscribe();
            return;
        }
        const { unsynced, deleted } = session.getSnapshot();
        if (!unsynced || deleted) {
            unsubscribe();
            sessions.delete(todoId);
            session.close();
        }
    };
    const unsubscribe = session.subscribe(closeWhenSynced);
    // after a moment: a form that is mounted again right away (StrictMode) keeps the connection
    setTimeout(closeWhenSynced, 1000);
}

// Reloading or closing the tab while changes aren't synced: the browser asks for confirmation
window.addEventListener("beforeunload", (event) => {
    if ([...sessions.values()].some(({ session }) => session.getSnapshot().unsynced)) {
        event.preventDefault();
    }
});
