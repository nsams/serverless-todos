import { z } from "zod";

import { procedure, router } from "~/api/trpc.server";

import { getListRepository } from "./db/lists.server";
import { maxListNameLength } from "./limits";

// Empty names are reported to the user (see the procedures), invalid input otherwise throws
const nameSchema = z.string().trim().max(maxListNameLength);

// API of the todo lists (api.lists.*)
export const listsApi = router({
    // The user's lists with their number of open todos: the module's navigation data (sidebar), see navigation.ts
    list: procedure.query(({ ctx: { user } }) => getListRepository().list(user.id)),

    // The list shown on /lists, created if the user has none yet (a mutation: it may create a list)
    getDefault: procedure.mutation(async ({ ctx: { user } }) => {
        const { id } = await getListRepository().getOrCreateDefault(user.id);
        return { id };
    }),

    create: procedure.input(z.object({ name: nameSchema })).mutation(async ({ input: { name }, ctx: { user } }) => {
        if (!name) {
            return { error: "Name is required", id: null };
        }
        const { id } = await getListRepository().create(user.id, name);
        return { error: null, id };
    }),

    rename: procedure.input(z.object({ id: z.string(), name: nameSchema })).mutation(async ({ input: { id, name }, ctx: { user } }) => {
        if (!name) {
            return { error: "Name is required" };
        }
        await getListRepository().rename(user.id, id, name);
        return { error: null };
    }),

    delete: procedure.input(z.object({ id: z.string() })).mutation(async ({ input: { id }, ctx: { user } }) => {
        await getListRepository().delete(user.id, id);
    }),
});
