import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getListRepository } from "./db/lists.server";
import { getTodoRepository } from "./db/todos.server";
import { createTodoSchema, todoByIdSchema, updateTodoSchema } from "./schemas";
import { parseTodoSearch, validateTodoSearch } from "./todoSearch";

export const listTodos = createServerFn()
    // the search params are normalized leniently (invalid values are dropped), like in the route's validateSearch
    .validator(z.looseObject({ listId: z.string() }).transform(({ listId, ...search }) => ({ listId, ...validateTodoSearch(search) })))
    .handler(async ({ data: { listId, ...search }, context: { user } }) => {
        const list = await getListRepository().get(user.id, listId);
        if (!list) {
            throw notFound();
        }
        const { page, pageSize, sort, filter } = parseTodoSearch(search);
        const { rows, totalCount } = await getTodoRepository().list(user.id, listId, { offset: page * pageSize, limit: pageSize, sort, filter });
        return { list, todos: rows, totalCount };
    });

export const createTodo = createServerFn({ method: "POST" })
    .validator(createTodoSchema)
    .handler(async ({ data: { listId, ...values }, context: { user } }) => {
        if (!values.title) {
            return { error: "Title is required" };
        }
        if (!(await getTodoRepository().create(user.id, listId, values))) {
            throw notFound();
        }
        return { error: null };
    });

export const updateTodo = createServerFn({ method: "POST" })
    .validator(updateTodoSchema)
    .handler(async ({ data: { id, ...values }, context: { user } }) => {
        if (!(await getTodoRepository().update(user.id, id, values))) {
            throw notFound();
        }
    });

export const deleteTodo = createServerFn({ method: "POST" })
    .validator(todoByIdSchema)
    .handler(async ({ data: { id }, context: { user } }) => {
        await getTodoRepository().delete(user.id, id);
    });
