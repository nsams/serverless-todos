import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { createModuleApi } from "~/api/client";

import type { TodosRouter } from "./api.server";
import { todosModuleId } from "./moduleId";

// The client of the module's API (api.server.ts), e.g. `await todosApi.createTodo.mutate({ listId, title })`,
// `todosApi.listTodos.queryOptions({ listId })` (TanStack Query)
export const todosApi = createModuleApi<TodosRouter>(todosModuleId);

// The results of the procedures, e.g. TodosApiOutputs["listLists"]
export type TodosApiOutputs = inferRouterOutputs<TodosRouter>;

// The inputs of the procedures (the operations' input types)
export type TodosApiInputs = inferRouterInputs<TodosRouter>;
