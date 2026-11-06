import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { isDateString } from "./dates";
import { getListRepository } from "./db/lists.server";
import { getTodoRepository } from "./db/todos.server";
import { parseTodoSearch, type TodoSearch, validateTodoSearch } from "./todoSearch";

function isObject(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null;
}

function requireId(input: unknown, key: string) {
    if (!isObject(input) || typeof input[key] !== "string") {
        throw new Error("Invalid input");
    }
    return input[key];
}

// Empty string (cleared date input) and null remove the due date, invalid dates too
function parseDueDate(value: unknown) {
    return isDateString(value) ? value : null;
}

export const listTodos = createServerFn()
    .validator((input: TodoSearch & { listId: string }) => ({ listId: requireId(input, "listId"), ...validateTodoSearch(input) }))
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
    .validator((input: { listId: string; title: string; description?: string; dueDate?: string | null }) => ({
        listId: requireId(input, "listId"),
        title: String(input.title ?? "").trim(),
        description: String(input.description ?? "").trim(),
        dueDate: parseDueDate(input.dueDate),
    }))
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
    .validator((input: { id: string; title?: string; description?: string; dueDate?: string | null; done?: boolean; listId?: string }) => {
        const id = requireId(input, "id");
        return {
            id,
            ...(typeof input.title === "string" && input.title.trim() && { title: input.title.trim() }),
            ...(typeof input.description === "string" && { description: input.description.trim() }),
            ...("dueDate" in input && { dueDate: parseDueDate(input.dueDate) }),
            ...(typeof input.done === "boolean" && { done: input.done }),
            ...(typeof input.listId === "string" && { listId: input.listId }),
        };
    })
    .handler(async ({ data: { id, ...values }, context: { user } }) => {
        if (!(await getTodoRepository().update(user.id, id, values))) {
            throw notFound();
        }
    });

export const deleteTodo = createServerFn({ method: "POST" })
    .validator((input: { id: string }) => ({ id: requireId(input, "id") }))
    .handler(async ({ data: { id }, context: { user } }) => {
        await getTodoRepository().delete(user.id, id);
    });
