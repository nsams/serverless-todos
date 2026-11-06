import { createServerFn } from "@tanstack/react-start";

import { getListRepository } from "./db/lists.server";

function parseInput<Keys extends string>(input: unknown, keys: Keys[]): Record<Keys, string> {
    if (typeof input !== "object" || input === null) {
        throw new Error("Invalid input");
    }
    const record = input as Record<string, unknown>;
    return Object.fromEntries(
        keys.map((key) => {
            if (typeof record[key] !== "string") {
                throw new Error("Invalid input");
            }
            return [key, key === "name" ? record[key].trim() : record[key]];
        }),
    ) as Record<Keys, string>;
}

export const listLists = createServerFn().handler(async ({ context: { user } }) => {
    return { user, lists: await getListRepository().list(user.id) };
});

// The list shown on the start page, created if the user has none yet
export const getDefaultList = createServerFn().handler(async ({ context: { user } }) => {
    const { id } = await getListRepository().getOrCreateDefault(user.id);
    return { id };
});

export const createList = createServerFn({ method: "POST" })
    .validator((input: { name: string }) => parseInput(input, ["name"]))
    .handler(async ({ data: { name }, context: { user } }) => {
        if (!name) {
            return { error: "Name is required", id: null };
        }
        const { id } = await getListRepository().create(user.id, name);
        return { error: null, id };
    });

export const renameList = createServerFn({ method: "POST" })
    .validator((input: { id: string; name: string }) => parseInput(input, ["id", "name"]))
    .handler(async ({ data: { id, name }, context: { user } }) => {
        if (!name) {
            return { error: "Name is required" };
        }
        await getListRepository().rename(user.id, id, name);
        return { error: null };
    });

export const deleteList = createServerFn({ method: "POST" })
    .validator((input: { id: string }) => parseInput(input, ["id"]))
    .handler(async ({ data: { id }, context: { user } }) => {
        await getListRepository().delete(user.id, id);
    });
