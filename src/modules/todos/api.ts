import type { inferRouterOutputs } from "@trpc/server";

import { createModuleApi } from "~/api/client";

import type { TodosRouter } from "./api.server";
import { todosModuleId } from "./moduleId";

// The client of the module's API (api.server.ts) as TanStack Query options, e.g. `useSuspenseQuery(todosApi.listLists.queryOptions({}))`,
// `useMutation(todosApi.createTodo.mutationOptions())`. Every key starts with the module's id: a mutation reloads the module's queries.
export const todosApi = createModuleApi<TodosRouter>(todosModuleId);

// The results of the procedures, e.g. TodosApiOutputs["listLists"]
export type TodosApiOutputs = inferRouterOutputs<TodosRouter>;
