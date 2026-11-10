import { createServerFn } from "@tanstack/react-start";

import { operationInput, runOperation } from "~/operations";

import { noteOperations } from "./operations.server";

// Server functions of the notes: thin adapters over the module's operations (operations.server.ts), see notebooks.functions.ts

// The notes of a notebook for its grid (one page, sorted and filtered as in the URL)
export const listNotes = createServerFn()
    .validator(operationInput<typeof noteOperations.listNotes>)
    .handler(({ data, context }) => runOperation(noteOperations.listNotes, { userId: context.user.id }, data));

export const getNote = createServerFn()
    .validator(operationInput<typeof noteOperations.getNote>)
    .handler(({ data, context }) => runOperation(noteOperations.getNote, { userId: context.user.id }, data));

export const createNote = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.createNote>)
    .handler(({ data, context }) => runOperation(noteOperations.createNote, { userId: context.user.id }, data));

export const updateNote = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.updateNote>)
    .handler(({ data, context }) => runOperation(noteOperations.updateNote, { userId: context.user.id }, data));

export const deleteNote = createServerFn({ method: "POST" })
    .validator(operationInput<typeof noteOperations.deleteNote>)
    .handler(({ data, context }) => runOperation(noteOperations.deleteNote, { userId: context.user.id }, data));
