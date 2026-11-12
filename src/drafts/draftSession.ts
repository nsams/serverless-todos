import { AgentClient } from "agents/client";
import * as Y from "yjs";

import { ValidationError } from "~/errors";

import {
    applyTextChange,
    changedFields,
    discardDraft,
    type DraftClientMessage,
    type DraftDefinition,
    type DraftPeer,
    type DraftPresence,
    draftText,
    type DraftValues,
    fromBase64,
    hasDraft,
    isDraftServerMessage,
    readDraft,
    readPublished,
    setDraftValues,
    type TextChangeHint,
    toBase64,
} from "./draft";

// Publishing while the form's changes can't be synced (shown in the form like a validation error)
export class DraftNotSyncedError extends ValidationError {}

// A form's connection to a shared draft (draft.ts, the draft's Durable Object: draftAgent.server.ts): a local copy of the draft's
// Yjs document, synced over a WebSocket (reconnects by itself). The form edits the local copy, the changes are sent right away; what
// others change arrives as updates. Local changes made while disconnected are synced after reconnecting.
//
// Changes that aren't synced yet (e.g. the network is slow or gone) are the only ones that can get lost: while there are any, reloading
// or closing the tab asks for confirmation (the browser's beforeunload dialog), and a session the form doesn't use anymore (the user
// navigated elsewhere) stays connected until they are synced.

export type DraftSnapshot<Values extends DraftValues> = {
    // the first sync is done: the draft is there and can be edited
    ready: boolean;
    connected: boolean;
    // local changes the server doesn't have yet
    unsynced: boolean;
    // the entity was deleted
    deleted: boolean;
    values: Values;
    published: Values;
    // the fields whose draft value differs from the published one
    changedFields: (keyof Values & string)[];
    // the others on the draft and where they are
    peers: DraftPeer[];
};

// The origin of the server's updates applied to the local document (local changes have none)
const remote = Symbol("remote");

// How long publishing waits for the form's changes to be synced
const syncTimeout = 10_000;

// TextField: the draft's text fields (DraftDefinition)
export class DraftSession<Values extends DraftValues, TextField extends string = string> {
    readonly doc = new Y.Doc();
    readonly definition: DraftDefinition<Values, TextField>;
    readonly #socket: AgentClient;
    #listeners = new Set<() => void>();
    #snapshot: DraftSnapshot<Values>;
    #synced = false;
    #connected = false;
    #deleted = false;
    #peers: DraftPeer[] = [];
    #presence: DraftPresence | null = null;
    // local changes, counted; acknowledged by the server (ack-request, answered in order after the changes sent before)
    #localVersion = 0;
    #ackedVersion = 0;
    // called when the published entity changed (published or changed elsewhere, also by others)
    #publishedListeners = new Set<() => void>();

    // path: the draft's WebSocket route (serverDraft's connect), e.g. /api/todos/todos/<id>/draft
    constructor(definition: DraftDefinition<Values, TextField>, path: string) {
        this.definition = definition;
        this.#socket = new AgentClient({
            agent: "DraftAgent",
            // the worker picks the draft by the entity in the path, after checking that it is the user's
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
                const published = JSON.stringify(readPublished(this.definition, this.doc));
                Y.applyUpdate(this.doc, fromBase64(message.update), remote);
                if (message.type === "synced") {
                    this.#synced = true;
                }
                if (hadDraft && JSON.stringify(readPublished(this.definition, this.doc)) !== published) {
                    for (const listener of this.#publishedListeners) {
                        listener();
                    }
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
                // (the server closes the connection too, for good)
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

    #createSnapshot(): DraftSnapshot<Values> {
        const values = readDraft(this.definition, this.doc);
        const published = readPublished(this.definition, this.doc);
        return {
            ready: this.#synced && hasDraft(this.doc) && !this.#deleted,
            connected: this.#connected,
            unsynced: this.#localVersion > this.#ackedVersion,
            deleted: this.#deleted,
            values,
            published,
            changedFields: changedFields(this.definition, values, published),
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

    // Calls the listener when the published entity changed (published by anyone, or changed elsewhere); returns the unsubscribe
    onPublishedChange(listener: () => void) {
        this.#publishedListeners.add(listener);
        return () => {
            this.#publishedListeners.delete(listener);
        };
    }

    // Resolves when the server has all local changes (e.g. before publishing, which publishes the server's draft); rejects if they
    // can't be synced in time (offline) or the entity was deleted
    whenSynced(timeout = syncTimeout): Promise<void> {
        return new Promise((resolve, reject) => {
            const check = () => {
                const { connected, unsynced, deleted } = this.#snapshot;
                if (deleted) {
                    done();
                    reject(new ValidationError("This doesn't exist anymore."));
                } else if (connected && !unsynced) {
                    done();
                    resolve();
                }
            };
            const timer = setTimeout(() => {
                done();
                reject(new DraftNotSyncedError("Your changes aren't synced yet (no connection), please try again."));
            }, timeout);
            const unsubscribe = this.subscribe(check);
            const done = () => {
                clearTimeout(timer);
                unsubscribe();
            };
            check();
        });
    }

    setValues(values: Partial<Values>) {
        setDraftValues(this.definition, this.doc, values);
    }

    // Changes a text field to a new value; hint: where the input's cursor says the change is (see TextChangeHint)
    setText(field: TextField, value: string, hint?: TextChangeHint) {
        const text = draftText(this.doc, field);
        if (text) {
            this.doc.transact(() => applyTextChange(text, value, hint));
        } else {
            this.setValues({ [field]: value } as Partial<Values>);
        }
    }

    // Discards the draft's changes, for everyone
    discard() {
        discardDraft(this.definition, this.doc);
    }

    text(field: TextField) {
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

// The sessions by path, shared by the forms of a draft (e.g. React's StrictMode mounts twice); a session is closed when no form uses it
// anymore and its changes are synced
const sessions = new Map<string, { session: DraftSession<DraftValues>; users: number }>();

export function acquireDraftSession<Values extends DraftValues, TextField extends string>(
    definition: DraftDefinition<Values, TextField>,
    path: string,
): DraftSession<Values, TextField> {
    let entry = sessions.get(path);
    if (!entry) {
        entry = { session: new DraftSession(definition, path) as unknown as DraftSession<DraftValues>, users: 0 };
        sessions.set(path, entry);
    }
    entry.users++;
    return entry.session as unknown as DraftSession<Values, TextField>;
}

export function releaseDraftSession(path: string) {
    const entry = sessions.get(path);
    if (!entry || --entry.users > 0) {
        return;
    }
    const { session } = entry;
    session.setPresence(null);
    const closeWhenSynced = () => {
        // used again in the meantime
        if (sessions.get(path) !== entry || entry.users > 0) {
            unsubscribe();
            return;
        }
        const { unsynced, deleted } = session.getSnapshot();
        if (!unsynced || deleted) {
            unsubscribe();
            sessions.delete(path);
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
