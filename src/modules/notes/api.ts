import { createModuleApi } from "~/api/client";

import type { NotesRouter } from "./api.server";
import { notesModuleId } from "./moduleId";

// The client of the module's API (api.server.ts) as TanStack Query options, e.g. `useSuspenseQuery(notesApi.listNotebooks.queryOptions({}))`,
// `useMutation(notesApi.createNote.mutationOptions())`. Every key starts with the module's id: a mutation reloads the module's queries.
export const notesApi = createModuleApi<NotesRouter>(notesModuleId);
