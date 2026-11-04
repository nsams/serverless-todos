import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "./auth.server";
import { getTodoRepository } from "./db/todos.server";
import { parseTodoSearch, validateTodoSearch } from "./todoSearch";

function isObject(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null;
}

export const listTodos = createServerFn()
    .validator(validateTodoSearch)
    .handler(async ({ data }) => {
        const user = await requireUser();
        const { page, pageSize, sort, filter } = parseTodoSearch(data);
        const { rows, totalCount } = await getTodoRepository().list(user.id, { offset: page * pageSize, limit: pageSize, sort, filter });
        return { user, todos: rows, totalCount };
    });

export const createTodo = createServerFn({ method: "POST" })
    .validator((input: unknown) => ({ title: String(isObject(input) ? (input.title ?? "") : "").trim() }))
    .handler(async ({ data: { title } }) => {
        const user = await requireUser();
        if (!title) {
            return { error: "Title is required" };
        }
        await getTodoRepository().create(user.id, title);
        return { error: null };
    });

export const updateTodo = createServerFn({ method: "POST" })
    .validator((input: { id: string; title?: string; done?: boolean }) => {
        if (!isObject(input) || typeof input.id !== "string") {
            throw new Error("Invalid input");
        }
        return {
            id: input.id,
            ...(typeof input.title === "string" && { title: input.title }),
            ...(typeof input.done === "boolean" && { done: input.done }),
        };
    })
    .handler(async ({ data: { id, ...values } }) => {
        const user = await requireUser();
        await getTodoRepository().update(user.id, id, values);
    });

export const deleteTodo = createServerFn({ method: "POST" })
    .validator((input: { id: string }) => {
        if (!isObject(input) || typeof input.id !== "string") {
            throw new Error("Invalid input");
        }
        return { id: input.id };
    })
    .handler(async ({ data: { id } }) => {
        const user = await requireUser();
        await getTodoRepository().delete(user.id, id);
    });
