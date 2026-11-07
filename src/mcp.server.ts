import { type CallToolResult, createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { User } from "./auth.server";
import { dateStringSchema } from "./dates";
import { getListRepository, type List } from "./db/lists.server";
import { getTodoRepository, type Todo, type TodoFilter } from "./db/todos.server";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "./limits";

// MCP server (Streamable HTTP, stateless) at /mcp, see src/routes/mcp.ts: lets MCP clients (Claude, ...) manage the authenticated user's lists and todos,
// the same operations as the UI (src/lists.functions.ts, src/todos.functions.ts)

const listOutputSchema = z.object({ id: z.string(), name: z.string() });
const listWithCountOutputSchema = listOutputSchema.extend({ openCount: z.number().describe("Number of todos not done") });

const todoOutputSchema = z.object({
    id: z.string(),
    listId: z.string(),
    title: z.string(),
    description: z.string(),
    dueDate: z.string().nullable().describe("Calendar date YYYY-MM-DD, null: no due date"),
    done: z.boolean(),
    createdAt: z.string().describe("ISO timestamp"),
});

const listIdSchema = z.string().describe("Id of the list (see list_lists)");
const todoIdSchema = z.string().describe("Id of the todo (see list_todos)");
const listNameSchema = z.string().trim().min(1).max(maxListNameLength).describe("Name of the list");
const todoTitleSchema = z.string().trim().min(1).max(maxTodoTitleLength).describe("Title of the todo");
const todoDescriptionSchema = z.string().trim().max(maxTodoDescriptionLength).describe("Longer description (plain text)");

function toListOutput({ id, name }: List) {
    return { id, name };
}

function toTodoOutput({ id, listId, title, description, dueDate, done, createdAt }: Todo): z.infer<typeof todoOutputSchema> {
    return { id, listId, title, description, dueDate, done, createdAt: createdAt.toISOString() };
}

function success<T extends Record<string, unknown>>(output: T) {
    return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output } satisfies CallToolResult;
}

function failure(message: string) {
    return { content: [{ type: "text", text: message }], isError: true } satisfies CallToolResult;
}

function createMcpServer(user: User) {
    const server = new McpServer({ name: "serverless-todos", version: "1.0.0" });
    const lists = getListRepository();
    const todos = getTodoRepository();

    // Lists

    server.registerTool(
        "list_lists",
        {
            title: "List todo lists",
            description: "Lists the user's todo lists (id, name, number of open todos), oldest first.",
            inputSchema: z.object({}),
            outputSchema: z.object({ lists: z.array(listWithCountOutputSchema) }),
            annotations: { readOnlyHint: true },
        },
        async () => {
            const rows = await lists.list(user.id);
            return success({ lists: rows.map((list) => ({ ...toListOutput(list), openCount: list.openCount })) });
        },
    );

    server.registerTool(
        "create_list",
        {
            title: "Create list",
            description: "Creates a todo list.",
            inputSchema: z.object({ name: listNameSchema }),
            outputSchema: listOutputSchema,
        },
        async ({ name }) => success(toListOutput(await lists.create(user.id, name))),
    );

    server.registerTool(
        "rename_list",
        {
            title: "Rename list",
            description: "Renames a todo list.",
            inputSchema: z.object({ id: listIdSchema, name: listNameSchema }),
            outputSchema: listOutputSchema,
            annotations: { idempotentHint: true },
        },
        async ({ id, name }) => {
            const list = await lists.rename(user.id, id, name);
            return list ? success(toListOutput(list)) : failure(`List ${id} not found`);
        },
    );

    server.registerTool(
        "delete_list",
        {
            title: "Delete list",
            description: "Deletes a todo list including all its todos. Cannot be undone.",
            inputSchema: z.object({ id: listIdSchema }),
            outputSchema: z.object({ deleted: z.literal(true) }),
            annotations: { destructiveHint: true, idempotentHint: true },
        },
        async ({ id }) => ((await lists.delete(user.id, id)) ? success({ deleted: true as const }) : failure(`List ${id} not found`)),
    );

    // Todos

    server.registerTool(
        "list_todos",
        {
            title: "List todos",
            description:
                "Lists the todos of a list, optionally filtered (all filters combined with AND) and sorted. " +
                "Overdue todos: done=false and dueTo=yesterday (in the user's time zone). Paginated with limit/offset, totalCount is the number of all matching todos.",
            inputSchema: z.object({
                listId: listIdSchema.optional().describe("Id of the list (see list_lists); defaults to the user's first list"),
                done: z.boolean().optional().describe("Only done (true) or open (false) todos"),
                titleContains: z.string().min(1).optional().describe("Only todos whose title contains this text (case-insensitive)"),
                descriptionContains: z.string().min(1).optional().describe("Only todos whose description contains this text (case-insensitive)"),
                dueFrom: dateStringSchema.optional().describe("Only todos due on or after this date (YYYY-MM-DD); excludes todos without due date"),
                dueTo: dateStringSchema.optional().describe("Only todos due on or before this date (YYYY-MM-DD); excludes todos without due date"),
                sort: z
                    .array(
                        z.object({
                            field: z.enum(["title", "description", "dueDate", "done", "createdAt"]),
                            direction: z.enum(["asc", "desc"]),
                        }),
                    )
                    .optional()
                    .describe("Sort order (todos without due date always last); newest first by default and as tie-breaker"),
                limit: z.number().int().min(1).max(100).default(50),
                offset: z.number().int().min(0).default(0),
            }),
            outputSchema: z.object({ list: listOutputSchema.nullable(), todos: z.array(todoOutputSchema), totalCount: z.number() }),
            annotations: { readOnlyHint: true },
        },
        async ({ listId, done, titleContains, descriptionContains, dueFrom, dueTo, sort = [], limit, offset }) => {
            // without listId: the first list (not created if the user has none, as this tool is read-only)
            const list = listId !== undefined ? await lists.get(user.id, listId) : (await lists.list(user.id)).at(0);
            if (!list) {
                return listId !== undefined ? failure(`List ${listId} not found`) : success({ list: null, todos: [], totalCount: 0 });
            }
            const filters: (TodoFilter | false)[] = [
                done !== undefined && { field: "done", operator: "is", value: done },
                titleContains !== undefined && { field: "title", operator: "contains", value: titleContains },
                descriptionContains !== undefined && { field: "description", operator: "contains", value: descriptionContains },
                dueFrom !== undefined && { field: "dueDate", operator: "onOrAfter", value: dueFrom },
                dueTo !== undefined && { field: "dueDate", operator: "onOrBefore", value: dueTo },
            ];
            const { rows, totalCount } = await todos.list(user.id, list.id, {
                offset,
                limit,
                sort,
                filter: { items: filters.filter((filter) => filter !== false), logicOperator: "and" },
            });
            return success({ list: toListOutput(list), todos: rows.map(toTodoOutput), totalCount });
        },
    );

    server.registerTool(
        "get_todo",
        {
            title: "Get todo",
            description: "Gets a single todo.",
            inputSchema: z.object({ id: todoIdSchema }),
            outputSchema: todoOutputSchema,
            annotations: { readOnlyHint: true },
        },
        async ({ id }) => {
            const todo = await todos.get(user.id, id);
            return todo ? success(toTodoOutput(todo)) : failure(`Todo ${id} not found`);
        },
    );

    server.registerTool(
        "create_todo",
        {
            title: "Create todo",
            description: "Creates a todo. Without listId it is added to the user's first list (created if the user has no list yet).",
            inputSchema: z.object({
                title: todoTitleSchema,
                description: todoDescriptionSchema.optional(),
                dueDate: dateStringSchema.optional().describe("Due date as calendar date YYYY-MM-DD"),
                listId: listIdSchema.optional().describe("Id of the list (see list_lists); defaults to the user's first list"),
            }),
            outputSchema: todoOutputSchema,
        },
        async ({ title, description = "", dueDate = null, listId }) => {
            const targetListId = listId ?? (await lists.getOrCreateDefault(user.id)).id;
            const todo = await todos.create(user.id, targetListId, { title, description, dueDate });
            return todo ? success(toTodoOutput(todo)) : failure(`List ${targetListId} not found`);
        },
    );

    server.registerTool(
        "update_todo",
        {
            title: "Update todo",
            description:
                "Changes a todo: only the given fields are changed. Also used to mark a todo as done (done=true) or to move it to another list (listId).",
            inputSchema: z.object({
                id: todoIdSchema,
                title: todoTitleSchema.optional(),
                description: todoDescriptionSchema.optional(),
                dueDate: dateStringSchema.nullable().optional().describe("Due date as calendar date YYYY-MM-DD, null removes the due date"),
                done: z.boolean().optional(),
                listId: listIdSchema.optional().describe("Moves the todo to this list (see list_lists)"),
            }),
            outputSchema: todoOutputSchema,
            annotations: { idempotentHint: true },
        },
        async ({ id, ...values }) => {
            const todo = await todos.update(user.id, id, values);
            return todo
                ? success(toTodoOutput(todo))
                : failure(values.listId !== undefined ? `Todo ${id} or list ${values.listId} not found` : `Todo ${id} not found`);
        },
    );

    server.registerTool(
        "delete_todo",
        {
            title: "Delete todo",
            description: "Deletes a todo. Cannot be undone (to complete a todo, use update_todo with done=true instead).",
            inputSchema: z.object({ id: todoIdSchema }),
            outputSchema: z.object({ deleted: z.literal(true) }),
            annotations: { destructiveHint: true, idempotentHint: true },
        },
        async ({ id }) => ((await todos.delete(user.id, id)) ? success({ deleted: true as const }) : failure(`Todo ${id} not found`)),
    );

    return server;
}

export function handleMcpRequest(request: Request, user: User) {
    // MCP clients don't send an Origin header; a browser does (cross-site requests from other origins are rejected, as recommended by the MCP spec)
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== new URL(request.url).origin) {
        return new Response("Forbidden", { status: 403 });
    }
    // a fresh (stateless) server per request, bound to the authenticated user
    return createMcpHandler(() => createMcpServer(user), { onerror: (error) => console.error("MCP error", error) }).fetch(request);
}
