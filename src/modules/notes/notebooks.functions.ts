import { createServerFn } from "@tanstack/react-start";

import { operationInput, runOperation } from "~/operations";

import { noteOperations } from "./operations.server";

// Server functions of the notebooks: thin adapters over the module's operations (operations.server.ts), which validate the input
// and do the checks. Errors are mapped in src/start.ts (NotFoundError → not found, ValidationError → shown in the form).

// The user's notebooks with their number of notes: the module's navigation data (sidebar), see navigation.ts
export const listNotebooks = createServerFn().handler(({ context }) => runOperation(noteOperations.listNotebooks, { userId: context.user.id }, {}));

// The notebook shown on /notes, created if the user has none yet (POST: it may create a notebook)
export const getDefaultNotebook = createServerFn({ method: "POST" }).handler(({ context }) =>
    runOperation(noteOperations.getDefaultNotebook, { userId: context.user.id }, {}),
);

export const createNotebook = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.createNotebook>)
    .handler(({ data, context }) => runOperation(noteOperations.createNotebook, { userId: context.user.id }, data));

export const renameNotebook = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.renameNotebook>)
    .handler(({ data, context }) => runOperation(noteOperations.renameNotebook, { userId: context.user.id }, data));

export const deleteNotebook = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.deleteNotebook>)
    .handler(({ data, context }) => runOperation(noteOperations.deleteNotebook, { userId: context.user.id }, data));
