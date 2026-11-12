import { defineHistory } from "~/history/history.server";

import { todoEntityType, type todos } from "./schema";

type Todo = typeof todos.$inferSelect;

const recordedFields = ["title", "description", "dueDate", "done", "listId"] as const;

// The recorded fields of a todo (its history's values, also shown by the app)
export type TodoHistoryValues = Pick<Todo, (typeof recordedFields)[number]>;

// The todos' history (shared history, src/history/): creation, every change of these fields and deletion, recorded by the repositories
// (todos.server.ts; lists.server.ts: the todos of a deleted list)
export const todoHistory = defineHistory<Todo>()(todoEntityType, recordedFields);
