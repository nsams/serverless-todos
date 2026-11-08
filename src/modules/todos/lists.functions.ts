import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getListRepository } from "./db/lists.server";
import { maxListNameLength } from "./limits";

// Empty names are reported to the user (see the handlers), invalid input otherwise throws
const nameSchema = z.string().trim().max(maxListNameLength);

// The user's lists with their number of open todos: the module's navigation data (sidebar), see navigation.ts
export const listLists = createServerFn().handler(async ({ context: { user } }) => {
    return getListRepository().list(user.id);
});

// The list shown on /lists, created if the user has none yet (POST: it may create a list)
export const getDefaultList = createServerFn({ method: "POST" }).handler(async ({ context: { user } }) => {
    const { id } = await getListRepository().getOrCreateDefault(user.id);
    return { id };
});

export const createList = createServerFn({ method: "POST" })
    .validator(z.object({ name: nameSchema }))
    .handler(async ({ data: { name }, context: { user } }) => {
        if (!name) {
            return { error: "Name is required", id: null };
        }
        const { id } = await getListRepository().create(user.id, name);
        return { error: null, id };
    });

export const renameList = createServerFn({ method: "POST" })
    .validator(z.object({ id: z.string(), name: nameSchema }))
    .handler(async ({ data: { id, name }, context: { user } }) => {
        if (!name) {
            return { error: "Name is required" };
        }
        await getListRepository().rename(user.id, id, name);
        return { error: null };
    });

export const deleteList = createServerFn({ method: "POST" })
    .validator(z.object({ id: z.string() }))
    .handler(async ({ data: { id }, context: { user } }) => {
        await getListRepository().delete(user.id, id);
    });
