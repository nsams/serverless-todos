import { z } from "zod";

import { notFound, procedure, router } from "~/api/trpc.server";
import { gridInputSchema } from "~/gridSearch";

import { getNotebookRepository } from "./db/notebooks.server";
import { getNoteRepository } from "./db/notes.server";
import { maxNoteBodyLength, maxNoteTitleLength } from "./limits";
import { parseNoteSearch, validateNoteSearch } from "./noteSearch";

const bodySchema = z.string().max(maxNoteBodyLength);

// API of the notes (api.notes.*)
export const notesApi = router({
    // The notes of a notebook for its grid (one page, sorted and filtered as in the URL)
    list: procedure
        .input(gridInputSchema({ notebookId: z.string() }, validateNoteSearch))
        .query(async ({ input: { notebookId, ...search }, ctx: { user } }) => {
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
        }),

    get: procedure.input(z.object({ id: z.string() })).query(async ({ input: { id }, ctx: { user } }) => {
        const note = await getNoteRepository().get(user.id, id);
        if (!note) {
            throw notFound();
        }
        return note;
    }),

    create: procedure
        .input(
            z.object({
                notebookId: z.string(),
                // an empty title is reported to the user (see below)
                title: z.string().trim().max(maxNoteTitleLength),
            }),
        )
        .mutation(async ({ input: { notebookId, title }, ctx: { user } }) => {
            if (!title) {
                return { error: "Title is required", id: null };
            }
            const note = await getNoteRepository().create(user.id, notebookId, { title, body: "" });
            if (!note) {
                throw notFound();
            }
            return { error: null, id: note.id };
        }),

    update: procedure
        .input(
            z.object({
                id: z.string(),
                title: z.string().trim().min(1).max(maxNoteTitleLength).optional(),
                body: bodySchema.optional(),
                notebookId: z.string().optional(),
            }),
        )
        .mutation(async ({ input: { id, ...values }, ctx: { user } }) => {
            const updatedAt = await getNoteRepository().update(user.id, id, values);
            if (!updatedAt) {
                throw notFound();
            }
            // the editor tells its own changes from changes made elsewhere (e.g. by the assistant) by updatedAt
            return { updatedAt };
        }),

    delete: procedure.input(z.object({ id: z.string() })).mutation(async ({ input: { id }, ctx: { user } }) => {
        await getNoteRepository().delete(user.id, id);
    }),
});
