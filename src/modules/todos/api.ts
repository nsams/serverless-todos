import type { inferRouterOutputs } from "@trpc/server";

import { createModuleClient } from "~/api/client";

import type { TodosRouter } from "./api.server";
import { todosModuleId } from "./moduleId";

// The client of the module's API (api.server.ts), e.g. `await todosApi.createTodo.mutate({ listId, title })`
export const todosApi = createModuleClient<TodosRouter>(todosModuleId);

// The results of the procedures, e.g. TodosApiOutputs["listLists"]
export type TodosApiOutputs = inferRouterOutputs<TodosRouter>;
