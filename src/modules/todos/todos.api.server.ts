import { z } from "zod";

import { notFound, procedure, router } from "~/api/trpc.server";
import { dateStringSchema } from "~/dates";
import { gridInputSchema, validateGridSearch } from "~/gridSearch";

import { getListRepository } from "./db/lists.server";
import { getTodoRepository } from "./db/todos.server";
import { maxTodoDescriptionLength, maxTodoTitleLength } from "./limits";
import { parseTodoSearch } from "./todoSearch";

const descriptionSchema = z.string().trim().max(maxTodoDescriptionLength);
// null: no due date
const dueDateSchema = dateStringSchema.nullable();

// API of the todos (api.todos.*)
export const todosApi = router({
    // The todos of a list for its grid (one page, sorted and filtered as in the URL)
    list: procedure
        .input(gridInputSchema({ listId: z.string() }, validateGridSearch))
        .query(async ({ input: { listId, ...search }, ctx: { user } }) => {
            const list = await getListRepository().get(user.id, listId);
            if (!list) {
                throw notFound();
            }
            const { page, pageSize, sort, filter } = parseTodoSearch(search);
            const { rows, totalCount } = await getTodoRepository().list(user.id, listId, { offset: page * pageSize, limit: pageSize, sort, filter });
            return { list, todos: rows, totalCount };
        }),

    create: procedure
        .input(
            z.object({
                listId: z.string(),
                // an empty title is reported to the user (see below)
                title: z.string().trim().max(maxTodoTitleLength),
                description: descriptionSchema,
                dueDate: dueDateSchema,
            }),
        )
        .mutation(async ({ input: { listId, ...values }, ctx: { user } }) => {
            if (!values.title) {
                return { error: "Title is required" };
            }
            if (!(await getTodoRepository().create(user.id, listId, values))) {
                throw notFound();
            }
            return { error: null };
        }),

    update: procedure
        .input(
            z.object({
                id: z.string(),
                title: z.string().trim().min(1).max(maxTodoTitleLength).optional(),
                description: descriptionSchema.optional(),
                dueDate: dueDateSchema.optional(),
                done: z.boolean().optional(),
                listId: z.string().optional(),
            }),
        )
        .mutation(async ({ input: { id, ...values }, ctx: { user } }) => {
            if (!(await getTodoRepository().update(user.id, id, values))) {
                throw notFound();
            }
        }),

    delete: procedure.input(z.object({ id: z.string() })).mutation(async ({ input: { id }, ctx: { user } }) => {
        await getTodoRepository().delete(user.id, id);
    }),
});
