import { createServerFn } from "@tanstack/react-start";

import { operationInput, runOperation } from "~/operations";

import { todoOperations } from "./operations.server";

// Server functions of the lists: thin adapters over the module's operations (operations.server.ts), which validate the input
// and do the checks. Errors are mapped in src/start.ts (NotFoundError → not found, ValidationError → shown in the form).

// The user's lists with their number of open todos: the module's navigation data (sidebar), see navigation.ts
export const listLists = createServerFn().handler(({ context }) => runOperation(todoOperations.listLists, { userId: context.user.id }, {}));

// The list shown on /lists, created if the user has none yet (POST: it may create a list)
export const getDefaultList = createServerFn({ method: "POST" }).handler(({ context }) =>
    runOperation(todoOperations.getDefaultList, { userId: context.user.id }, {}),
);

export const createList = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.createList>)
    .handler(({ data, context }) => runOperation(todoOperations.createList, { userId: context.user.id }, data));

export const renameList = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.renameList>)
    .handler(({ data, context }) => runOperation(todoOperations.renameList, { userId: context.user.id }, data));

export const deleteList = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.deleteList>)
    .handler(({ data, context }) => runOperation(todoOperations.deleteList, { userId: context.user.id }, data));
