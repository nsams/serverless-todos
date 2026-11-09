import { z } from "zod";

import { procedure, router } from "~/api/trpc.server";

import { getNotebookRepository } from "./db/notebooks.server";
import { maxNotebookNameLength } from "./limits";

// Empty names are reported to the user (see the procedures), invalid input otherwise throws
const nameSchema = z.string().trim().max(maxNotebookNameLength);

// API of the notebooks (api.notebooks.*)
export const notebooksApi = router({
    // The user's notebooks with their number of notes: the module's navigation data (sidebar), see navigation.ts
    list: procedure.query(({ ctx: { user } }) => getNotebookRepository().list(user.id)),

    // The notebook shown on /notes, created if the user has none yet (a mutation: it may create a notebook)
    getDefault: procedure.mutation(async ({ ctx: { user } }) => {
        const { id } = await getNotebookRepository().getOrCreateDefault(user.id);
        return { id };
    }),

    create: procedure.input(z.object({ name: nameSchema })).mutation(async ({ input: { name }, ctx: { user } }) => {
        if (!name) {
            return { error: "Name is required", id: null };
        }
        const { id } = await getNotebookRepository().create(user.id, name);
        return { error: null, id };
    }),

    rename: procedure.input(z.object({ id: z.string(), name: nameSchema })).mutation(async ({ input: { id, name }, ctx: { user } }) => {
        if (!name) {
            return { error: "Name is required" };
        }
        await getNotebookRepository().rename(user.id, id, name);
        return { error: null };
    }),

    delete: procedure.input(z.object({ id: z.string() })).mutation(async ({ input: { id }, ctx: { user } }) => {
        await getNotebookRepository().delete(user.id, id);
    }),
});
