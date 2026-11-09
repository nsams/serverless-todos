import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { gridInputSchema } from "~/gridSearch";

import { getNotebookRepository } from "./db/notebooks.server";
import { getNoteRepository } from "./db/notes.server";
import { maxNoteBodyLength, maxNoteTitleLength } from "./limits";
import { parseNoteSearch, validateNoteSearch } from "./noteSearch";

const bodySchema = z.string().max(maxNoteBodyLength);

// The notes of a notebook for its grid (one page, sorted and filtered as in the URL)
export const listNotes = createServerFn()
    .validator(gridInputSchema({ notebookId: z.string() }, validateNoteSearch))
    .handler(async ({ data: { notebookId, ...search }, context: { user } }) => {
        const notebook = await getNotebookRepository().get(user.id, notebookId);
        if (!notebook) {
            throw notFound();
        }
        const { page, pageSize, sort, filter, query } = parseNoteSearch(search);
        const { rows, totalCount } = await getNoteRepository().list(user.id, notebookId, {
            offset: page * pageSize,
            limit: pageSize,
            sort,
            filter,
            query,
        });
        return { notebook, notes: rows, totalCount };
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
