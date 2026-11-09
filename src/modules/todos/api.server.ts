import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { createApi, gridQueryValidator } from "~/api/hono.server";
import { dateStringSchema } from "~/dates";
import { validateGridSearch } from "~/gridSearch";

import { getListRepository } from "./db/lists.server";
import { getTodoRepository } from "./db/todos.server";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "./limits";
import { parseTodoSearch } from "./todoSearch";

// The module's REST API (lists and todos), mounted at /api (src/modules/registry.server.ts), see src/api/api.server.ts for the conventions

// Empty names and titles are reported to the user (422, see the handlers), invalid input otherwise is rejected (400)
const nameSchema = z.object({ name: z.string().trim().max(maxListNameLength) });
const descriptionSchema = z.string().trim().max(maxTodoDescriptionLength);
// null: no due date
const dueDateSchema = dateStringSchema.nullable();

export const todosApi = createApi()
    // The user's lists with their number of open todos: the sidebar, see queries.ts
    .get("/lists", async (c) => {
        return c.json(await getListRepository().list(c.var.user.id));
    })
    // The list shown on /lists, created if the user has none yet (POST: it may create a list)
    .post("/lists/default", async (c) => {
        const { id } = await getListRepository().getOrCreateDefault(c.var.user.id);
        return c.json({ id });
    })
    .post("/lists", zValidator("json", nameSchema), async (c) => {
        const { name } = c.req.valid("json");
        if (!name) {
            return c.json({ error: "Name is required" }, 422);
        }
        const { id } = await getListRepository().create(c.var.user.id, name);
        return c.json({ id }, 201);
    })
    .patch("/lists/:listId", zValidator("json", nameSchema), async (c) => {
        const { name } = c.req.valid("json");
        if (!name) {
            return c.json({ error: "Name is required" }, 422);
        }
        await getListRepository().rename(c.var.user.id, c.req.param("listId"), name);
        return c.body(null, 204);
    })
    // Deletes the list's todos too
    .delete("/lists/:listId", async (c) => {
        await getListRepository().delete(c.var.user.id, c.req.param("listId"));
        return c.body(null, 204);
    })
    // The todos of a list for its grid: one page, sorted and filtered as in the query (the grid state in the page's URL, src/gridSearch.ts)
    .get("/lists/:listId/todos", gridQueryValidator, async (c) => {
        const { user } = c.var;
        const list = await getListRepository().get(user.id, c.req.param("listId"));
        if (!list) {
            return c.json({ error: "Not found" }, 404);
        }
        const { page, pageSize, sort, filter } = parseTodoSearch(validateGridSearch(c.req.valid("query")));
        const { rows, totalCount } = await getTodoRepository().list(user.id, list.id, { offset: page * pageSize, limit: pageSize, sort, filter });
        return c.json({ list, todos: rows, totalCount });
    })
    .post(
        "/lists/:listId/todos",
        zValidator(
            "json",
            z.object({
                title: z.string().trim().max(maxTodoTitleLength),
                description: descriptionSchema,
                dueDate: dueDateSchema,
            }),
        ),
        async (c) => {
            const values = c.req.valid("json");
            if (!values.title) {
                return c.json({ error: "Title is required" }, 422);
            }
            if (!(await getTodoRepository().create(c.var.user.id, c.req.param("listId"), values))) {
                return c.json({ error: "Not found" }, 404);
            }
            return c.body(null, 201);
        },
    )
    // Changes the given fields; listId moves the todo to another list
    .patch(
        "/todos/:todoId",
        zValidator(
            "json",
            z.object({
                title: z.string().trim().min(1).max(maxTodoTitleLength).optional(),
                description: descriptionSchema.optional(),
                dueDate: dueDateSchema.optional(),
                done: z.boolean().optional(),
                listId: z.string().optional(),
            }),
        ),
        async (c) => {
            if (!(await getTodoRepository().update(c.var.user.id, c.req.param("todoId"), c.req.valid("json")))) {
                return c.json({ error: "Not found" }, 404);
            }
            return c.body(null, 204);
        },
    )
    .delete("/todos/:todoId", async (c) => {
        await getTodoRepository().delete(c.var.user.id, c.req.param("todoId"));
        return c.body(null, 204);
    });
