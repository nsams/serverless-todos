import { data, href, redirect, replace } from "react-router";
import { z } from "zod";

import { dateStringSchema } from "~/dates";
import { defineIntent } from "~/intents";

import { getListRepository } from "./db/lists.server";
import { getTodoRepository } from "./db/todos.server";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "./limits";

// The changes of the module: intents of the route actions (see src/intents.ts), submitted with useIntents

// Empty names and titles are reported to the user (see the handlers), invalid input otherwise fails
const nameSchema = z.string().trim().max(maxListNameLength);
const descriptionSchema = z.string().trim().max(maxTodoDescriptionLength);
// null: no due date
const dueDateSchema = dateStringSchema.nullable();

function notFound(): never {
    throw data("Not found", { status: 404 });
}

// The action of /lists (routes/lists.index.tsx)
export const listsIntents = {
    // goes to the new list
    createList: defineIntent(z.object({ name: nameSchema }), async ({ name }, { user }) => {
        if (!name) {
            return { error: "Name is required" };
        }
        const { id } = await getListRepository().create(user.id, name);
        throw redirect(href("/lists/:listId", { listId: id }));
    }),
};

// The action of /lists/:listId (routes/lists.$listId.tsx)
export const listIntents = {
    renameList: defineIntent(z.object({ name: nameSchema }), async ({ name }, { user, params }) => {
        if (!name) {
            return { error: "Name is required" };
        }
        await getListRepository().rename(user.id, params.listId ?? "", name);
        return { error: null };
    }),
    // goes to the first remaining list (or a new one, see routes/lists.index.tsx)
    deleteList: defineIntent(z.object({}), async (_input, { user, params }) => {
        await getListRepository().delete(user.id, params.listId ?? "");
        throw replace(href("/lists"));
    }),
    createTodo: defineIntent(
        z.object({
            // an empty title is reported to the user (see the handler)
            title: z.string().trim().max(maxTodoTitleLength),
            description: descriptionSchema,
            dueDate: dueDateSchema,
        }),
        async (values, { user, params }) => {
            if (!values.title) {
                return { error: "Title is required" };
            }
            if (!(await getTodoRepository().create(user.id, params.listId ?? "", values))) {
                notFound();
            }
            return { error: null };
        },
    ),
    updateTodo: defineIntent(
        z.object({
            id: z.string(),
            title: z.string().trim().min(1).max(maxTodoTitleLength).optional(),
            description: descriptionSchema.optional(),
            dueDate: dueDateSchema.optional(),
            done: z.boolean().optional(),
            // moves the todo to another list
            listId: z.string().optional(),
        }),
        async ({ id, ...values }, { user }) => {
            if (!(await getTodoRepository().update(user.id, id, values))) {
                notFound();
            }
        },
    ),
    deleteTodo: defineIntent(z.object({ id: z.string() }), async ({ id }, { user }) => {
        await getTodoRepository().delete(user.id, id);
    }),
};

export type ListsIntents = typeof listsIntents;
export type ListIntents = typeof listIntents;
