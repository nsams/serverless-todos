import { tool } from "ai";
import { z } from "zod";

import { dateStringSchema } from "~/dates";
import { getListRepository } from "~/db/lists.server";
import { getTodoRepository, type Todo } from "~/db/todos.server";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "~/limits";

// Tools of the chat assistant. Every tool is scoped to the authenticated user (userId is never chosen by the model).
// Tools that throw report the error message to the model, which then tells the user.

const maxSearchResults = 50;

const titleSchema = z.string().trim().min(1).max(maxTodoTitleLength);
const descriptionSchema = z.string().trim().max(maxTodoDescriptionLength);
const listNameSchema = z.string().trim().min(1).max(maxListNameLength);
const dueDateSchema = dateStringSchema.nullable().describe("Due date as YYYY-MM-DD, null for no due date");

// What the model gets to see of a todo
function toolTodo({ id, listId, title, description, dueDate, done }: Todo) {
    return { id, listId, title, description, dueDate, done };
}

export function createTodoTools(userId: string) {
    const lists = getListRepository();
    const todos = getTodoRepository();

    const getList = async (listId: string) => {
        const list = await lists.get(userId, listId);
        if (!list) {
            throw new Error(`List ${listId} not found`);
        }
        return list;
    };
    const getTodo = async (id: string) => {
        const todo = await todos.get(userId, id);
        if (!todo) {
            throw new Error(`Todo ${id} not found`);
        }
        return todo;
    };

    return {
        listLists: tool({
            description: "Lists all todo lists of the user with their number of open todos.",
            inputSchema: z.object({}),
            execute: async () => (await lists.list(userId)).map(({ id, name, openCount }) => ({ id, name, openCount })),
        }),
        createList: tool({
            description: "Creates a new todo list.",
            inputSchema: z.object({ name: listNameSchema }),
            execute: async ({ name }) => {
                const { id } = await lists.create(userId, name);
                return { id, name };
            },
        }),
        renameList: tool({
            description: "Renames a todo list.",
            inputSchema: z.object({ listId: z.string(), name: listNameSchema }),
            execute: async ({ listId, name }) => {
                await getList(listId);
                await lists.rename(userId, listId, name);
                return { id: listId, name };
            },
        }),
        deleteList: tool({
            description: "Deletes a todo list including all its todos. The user is asked to confirm.",
            inputSchema: z.object({ listId: z.string() }),
            needsApproval: true,
            execute: async ({ listId }) => {
                const list = await getList(listId);
                await lists.delete(userId, listId);
                return { deleted: { id: list.id, name: list.name } };
            },
        }),
        findTodos: tool({
            description: `Finds todos, in all lists or in one list. Returns at most ${maxSearchResults} todos: open ones first, then by due date.`,
            inputSchema: z.object({
                listId: z.string().optional().describe("Only todos of this list"),
                query: z.string().trim().optional().describe("Only todos whose title or description contains this text (case-insensitive)"),
                status: z.enum(["open", "done", "all"]).default("open"),
            }),
            execute: async ({ listId, query, status }) => {
                const rows = await todos.search(userId, {
                    listId,
                    query: query || undefined,
                    done: status === "all" ? undefined : status === "done",
                    limit: maxSearchResults,
                });
                return rows.map(toolTodo);
            },
        }),
        createTodo: tool({
            description: "Creates a todo in a list.",
            inputSchema: z.object({
                listId: z.string(),
                title: titleSchema,
                description: descriptionSchema.default(""),
                dueDate: dueDateSchema.default(null),
            }),
            execute: async ({ listId, ...values }) => {
                await getList(listId);
                await todos.create(userId, listId, values);
                return { created: { listId, ...values } };
            },
        }),
        updateTodo: tool({
            description:
                "Updates a todo: change title, description or due date, mark it as done or open again, or move it to another list. Omitted fields stay unchanged.",
            inputSchema: z.object({
                id: z.string(),
                title: titleSchema.optional(),
                description: descriptionSchema.optional(),
                dueDate: dueDateSchema.optional(),
                done: z.boolean().optional(),
                listId: z.string().optional().describe("Moves the todo to this list"),
            }),
            execute: async ({ id, ...values }) => {
                await getTodo(id);
                if (values.listId !== undefined) {
                    await getList(values.listId);
                }
                await todos.update(userId, id, values);
                return { updated: toolTodo(await getTodo(id)) };
            },
        }),
        deleteTodo: tool({
            description: "Deletes a todo. The user is asked to confirm.",
            inputSchema: z.object({ id: z.string() }),
            needsApproval: true,
            execute: async ({ id }) => {
                const todo = await getTodo(id);
                await todos.delete(userId, id);
                return { deleted: toolTodo(todo) };
            },
        }),
    };
}
