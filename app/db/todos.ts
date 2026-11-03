import type { GridFields } from "~/grid/fields";

// Filterable and sortable todo fields, used by the repository and the todos grid
export const todoGridFields = { title: "string", done: "boolean", createdAt: "dateTime" } as const satisfies GridFields;
