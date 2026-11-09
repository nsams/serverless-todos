import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getNotebookRepository } from "./db/notebooks.server";
import { maxNotebookNameLength } from "./limits";

// Empty names are reported to the user (see the handlers), invalid input otherwise throws
const nameSchema = z.string().trim().max(maxNotebookNameLength);

// The user's notebooks with their number of notes: the module's navigation data (sidebar), see navigation.ts
export const listNotebooks = createServerFn().handler(async ({ context: { user } }) => {
    return getNotebookRepository().list(user.id);
});

// The notebook shown on /notes, created if the user has none yet (POST: it may create a notebook)
export const getDefaultNotebook = createServerFn({ method: "POST" }).handler(async ({ context: { user } }) => {
    const { id } = await getNotebookRepository().getOrCreateDefault(user.id);
    return { id };
});

export const createNotebook = createServerFn({ method: "POST" })
    .validator(z.object({ name: nameSchema }))
    .handler(async ({ data: { name }, context: { user } }) => {
        if (!name) {
            return { error: "Name is required", id: null };
        }
        const { id } = await getNotebookRepository().create(user.id, name);
        return { error: null, id };
    });

export const renameNotebook = createServerFn({ method: "POST" })
    .validator(z.object({ id: z.string(), name: nameSchema }))
    .handler(async ({ data: { id, name }, context: { user } }) => {
        if (!name) {
            return { error: "Name is required" };
        }
        await getNotebookRepository().rename(user.id, id, name);
        return { error: null };
    });

export const deleteNotebook = createServerFn({ method: "POST" })
    .validator(z.object({ id: z.string() }))
    .handler(async ({ data: { id }, context: { user } }) => {
        await getNotebookRepository().delete(user.id, id);
    });
