import { createServerFn } from "@tanstack/react-start";

import { operationHandler } from "~/operationHandler";
import { operationInput } from "~/operations";

import { noteOperations } from "./operations.server";

// Server functions of the notes: thin adapters over the module's operations (operations.server.ts), see notebooks.functions.ts

// The notes of a notebook for its grid (one page, sorted and filtered as in the URL)
export const listNotes = createServerFn()
    .validator(operationInput<typeof noteOperations.listNotes>)
    .handler(operationHandler(noteOperations.listNotes));

export const getNote = createServerFn()
    .validator(operationInput<typeof noteOperations.getNote>)
    .handler(operationHandler(noteOperations.getNote));

export const createNote = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.createNote>)
    .handler(operationHandler(noteOperations.createNote));

export const updateNote = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.updateNote>)
    .handler(operationHandler(noteOperations.updateNote));

export const deleteNote = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.deleteNote>)
    .handler(operationHandler(noteOperations.deleteNote));
