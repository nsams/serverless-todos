import { createServerFn } from "@tanstack/react-start";

import { operationHandler } from "~/operationHandler";
import { operationInput } from "~/operations";

import { todoOperations } from "./operations.server";

// Server functions of the lists: thin adapters over the module's operations (operations.server.ts), which validate the input
// and do the checks. Errors are mapped in src/start.ts (NotFoundError → not found, ValidationError → shown in the form).

// The user's lists with their number of open todos: the module's navigation data (sidebar), see queries.ts
export const listLists = createServerFn().handler(operationHandler(todoOperations.listLists));

// The list shown on /lists, created if the user has none yet (POST: it may create a list)
export const getDefaultList = createServerFn({ method: "POST" }).handler(operationHandler(todoOperations.getDefaultList));

export const createList = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.createList>)
    .handler(operationHandler(todoOperations.createList));

export const renameList = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.renameList>)
    .handler(operationHandler(todoOperations.renameList));

export const deleteList = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.deleteList>)
    .handler(operationHandler(todoOperations.deleteList));
