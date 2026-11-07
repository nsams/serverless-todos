import { z } from "zod";

import { dateStringSchema } from "./dates";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "./limits";

// Input of the operations on lists and todos, shared by the server functions (UI, src/*.functions.ts) and the MCP tools (src/mcp.server.ts).
// The descriptions end up in the MCP tool definitions.

export const listIdSchema = z.string().describe("Id of the list (see list_lists)");
const todoIdSchema = z.string().describe("Id of the todo (see list_todos)");

// Empty names and titles are not rejected by the schemas but reported to the user by the handlers (shown in the UI's form)
const listNameSchema = z.string().trim().max(maxListNameLength).describe("Name of the list");
const todoTitleSchema = z.string().trim().max(maxTodoTitleLength).describe("Title of the todo");
const todoDescriptionSchema = z.string().trim().max(maxTodoDescriptionLength).describe("Longer description (plain text)");
const dueDateSchema = dateStringSchema.nullable().describe("Due date as calendar date YYYY-MM-DD, null: no due date");

export const createListSchema = z.object({ name: listNameSchema });

export const renameListSchema = z.object({ id: listIdSchema, name: listNameSchema });

export const deleteListSchema = z.object({ id: listIdSchema });

export const createTodoSchema = z.object({
    listId: listIdSchema,
    title: todoTitleSchema,
    description: todoDescriptionSchema.default(""),
    dueDate: dueDateSchema.default(null),
});

// Only the given fields are changed
export const updateTodoSchema = z.object({
    id: todoIdSchema,
    title: todoTitleSchema.min(1).optional(),
    description: todoDescriptionSchema.optional(),
    dueDate: dueDateSchema.optional(),
    done: z.boolean().optional(),
    listId: listIdSchema.optional().describe("Moves the todo to this list (see list_lists)"),
});

export const todoByIdSchema = z.object({ id: todoIdSchema });
