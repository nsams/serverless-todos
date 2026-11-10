import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { createModuleApi } from "~/api/client";

import type { NotesRouter } from "./api.server";
import { notesModuleId } from "./moduleId";

// The client of the module's API (api.server.ts), e.g. `await notesApi.createNote.mutate({ notebookId, title })`,
// `notesApi.getNote.queryOptions({ id })` (TanStack Query)
export const notesApi = createModuleApi<NotesRouter>(notesModuleId);

// The results of the procedures, e.g. NotesApiOutputs["listNotebooks"]
export type NotesApiOutputs = inferRouterOutputs<NotesRouter>;

// The inputs of the procedures (the operations' input types)
export type NotesApiInputs = inferRouterInputs<NotesRouter>;
