import type { inferRouterOutputs } from "@trpc/server";

import { createModuleClient } from "~/api/client";

import type { NotesRouter } from "./api.server";
import { notesModuleId } from "./moduleId";

// The client of the module's API (api.server.ts), e.g. `await notesApi.createNote.mutate({ notebookId, title })`
export const notesApi = createModuleClient<NotesRouter>(notesModuleId);

// The results of the procedures, e.g. NotesApiOutputs["listNotebooks"]
export type NotesApiOutputs = inferRouterOutputs<NotesRouter>;
