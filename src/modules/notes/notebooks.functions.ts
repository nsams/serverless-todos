import { createServerFn } from "@tanstack/react-start";

import { operationHandler } from "~/operationHandler";
import { operationInput } from "~/operations";

import { noteOperations } from "./operations.server";

// Server functions of the notebooks: thin adapters over the module's operations (operations.server.ts), which validate the input
// and do the checks. Errors are mapped in src/start.ts (NotFoundError → not found, ValidationError → shown in the form).

// The user's notebooks with their number of notes: the module's navigation data (sidebar), see queries.ts
export const listNotebooks = createServerFn().handler(operationHandler(noteOperations.listNotebooks));

// The notebook shown on /notes, created if the user has none yet (POST: it may create a notebook)
export const getDefaultNotebook = createServerFn({ method: "POST" }).handler(operationHandler(noteOperations.getDefaultNotebook));

export const createNotebook = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.createNotebook>)
    .handler(operationHandler(noteOperations.createNotebook));

export const renameNotebook = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.renameNotebook>)
    .handler(operationHandler(noteOperations.renameNotebook));

export const deleteNotebook = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.deleteNotebook>)
    .handler(operationHandler(noteOperations.deleteNotebook));
