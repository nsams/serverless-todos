import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getNotebookRepository } from "./db/notebooks.server";
import { getNoteRepository } from "./db/notes.server";
import { maxNoteBodyLength, maxNoteTitleLength } from "./limits";

// The notes list of a notebook page shows at most this many notes (most recently changed first); the search finds older ones
const maxListedNotes = 200;

const bodySchema = z.string().max(maxNoteBodyLength);

// The notes of a notebook, optionally only those containing the search text
export const listNotes = createServerFn()
    .validator(z.object({ notebookId: z.string(), query: z.string().trim().optional() }))
    .handler(async ({ data: { notebookId, query }, context: { user } }) => {
        const notebook = await getNotebookRepository().get(user.id, notebookId);
        if (!notebook) {
            throw notFound();
        }
        const notes = await getNoteRepository().search(user.id, { notebookId, query: query || undefined, limit: maxListedNotes });
        return { notebook, notes };
    });

export const getNote = createServerFn()
    .validator(z.object({ id: z.string() }))
    .handler(async ({ data: { id }, context: { user } }) => {
        const note = await getNoteRepository().get(user.id, id);
        if (!note) {
            throw notFound();
        }
        return note;
    });

export const createNote = createServerFn({ method: "POST" })
    .validator(
        z.object({
            notebookId: z.string(),
            // an empty title is reported to the user (see the handler)
            title: z.string().trim().max(maxNoteTitleLength),
        }),
    )
    .handler(async ({ data: { notebookId, title }, context: { user } }) => {
        if (!title) {
            return { error: "Title is required", id: null };
        }
        const note = await getNoteRepository().create(user.id, notebookId, { title, body: "" });
        if (!note) {
            throw notFound();
        }
        return { error: null, id: note.id };
    });

export const updateNote = createServerFn({ method: "POST" })
    .validator(
        z.object({
            id: z.string(),
            title: z.string().trim().min(1).max(maxNoteTitleLength).optional(),
            body: bodySchema.optional(),
            notebookId: z.string().optional(),
        }),
    )
    .handler(async ({ data: { id, ...values }, context: { user } }) => {
        const updatedAt = await getNoteRepository().update(user.id, id, values);
        if (!updatedAt) {
            throw notFound();
        }
        // the editor tells its own changes from changes made elsewhere (e.g. by the assistant) by updatedAt
        return { updatedAt };
    });

export const deleteNote = createServerFn({ method: "POST" })
    .validator(z.object({ id: z.string() }))
    .handler(async ({ data: { id }, context: { user } }) => {
        await getNoteRepository().delete(user.id, id);
    });
