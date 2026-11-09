import { data, href, redirect, replace } from "react-router";
import { z } from "zod";

import { defineIntent } from "~/intents";

import { getNotebookRepository } from "./db/notebooks.server";
import { getNoteRepository } from "./db/notes.server";
import { maxNoteBodyLength, maxNotebookNameLength, maxNoteTitleLength } from "./limits";

// The changes of the module: intents of the route actions (see src/intents.ts), submitted with useIntents

// Empty names and titles are reported to the user (see the handlers), invalid input otherwise fails
const nameSchema = z.string().trim().max(maxNotebookNameLength);
const titleSchema = z.string().trim().max(maxNoteTitleLength);

function notFound(): never {
    throw data("Not found", { status: 404 });
}

async function updateNote(userId: string, id: string, values: { title?: string; body?: string; notebookId?: string }) {
    const updatedAt = await getNoteRepository().update(userId, id, values);
    if (!updatedAt) {
        notFound();
    }
    // the editor tells its own changes from changes made elsewhere (e.g. by the assistant) by updatedAt
    return { updatedAt };
}

// The action of /notes (routes/notes.index.tsx)
export const notebooksIntents = {
    // goes to the new notebook
    createNotebook: defineIntent(z.object({ name: nameSchema }), async ({ name }, { user }) => {
        if (!name) {
            return { error: "Name is required" };
        }
        const { id } = await getNotebookRepository().create(user.id, name);
        throw redirect(href("/notes/:notebookId", { notebookId: id }));
    }),
};

// The action of /notes/:notebookId (routes/notes.$notebookId.index.tsx)
export const notebookIntents = {
    renameNotebook: defineIntent(z.object({ name: nameSchema }), async ({ name }, { user, params }) => {
        if (!name) {
            return { error: "Name is required" };
        }
        await getNotebookRepository().rename(user.id, params.notebookId ?? "", name);
        return { error: null };
    }),
    // goes to the first remaining notebook (or a new one, see routes/notes.index.tsx)
    deleteNotebook: defineIntent(z.object({}), async (_input, { user, params }) => {
        await getNotebookRepository().delete(user.id, params.notebookId ?? "");
        throw replace(href("/notes"));
    }),
    // goes to the new note
    createNote: defineIntent(z.object({ title: titleSchema }), async ({ title }, { user, params }) => {
        if (!title) {
            return { error: "Title is required" };
        }
        const notebookId = params.notebookId ?? "";
        const note = await getNoteRepository().create(user.id, notebookId, { title, body: "" });
        if (!note) {
            notFound();
        }
        throw redirect(href("/notes/:notebookId/:noteId", { notebookId, noteId: note.id }));
    }),
    // moves a note to another notebook
    moveNote: defineIntent(z.object({ id: z.string(), notebookId: z.string() }), async ({ id, notebookId }, { user }) => {
        await updateNote(user.id, id, { notebookId });
    }),
    deleteNote: defineIntent(z.object({ id: z.string() }), async ({ id }, { user }) => {
        await getNoteRepository().delete(user.id, id);
    }),
};

// The action of /notes/:notebookId/:noteId (routes/notes.$notebookId.$noteId.tsx)
export const noteIntents = {
    // a move to another notebook: the page's loader goes to the note's new URL
    updateNote: defineIntent(
        z.object({
            title: titleSchema.min(1).optional(),
            body: z.string().max(maxNoteBodyLength).optional(),
            notebookId: z.string().optional(),
        }),
        async (values, { user, params }) => updateNote(user.id, params.noteId ?? "", values),
    ),
    // goes back to the notebook's grid (in the state of the search params)
    deleteNote: defineIntent(z.object({}), async (_input, { user, params, url }) => {
        await getNoteRepository().delete(user.id, params.noteId ?? "");
        throw replace(href("/notes/:notebookId", { notebookId: params.notebookId ?? "" }) + url.search);
    }),
};

export type NotebooksIntents = typeof notebooksIntents;
export type NotebookIntents = typeof notebookIntents;
export type NoteIntents = typeof noteIntents;
