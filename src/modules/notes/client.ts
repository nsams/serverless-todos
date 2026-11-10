import { useNavigationData, useOperations } from "~/modules/client";

import type notesServerModule from "./module.server";
import { notesModuleId } from "./moduleId";

// The module's server data on the client (src/modules/client.ts)

// Runs the module's operations (operations.server.ts), e.g. run("createNote", { notebookId, title })
export function useNoteOperations() {
    return useOperations<typeof notesServerModule>(notesModuleId);
}

// The user's notebooks with their number of notes (sidebar data, see module.server.ts)
export function useNotebooks() {
    return useNavigationData<typeof notesServerModule>(notesModuleId);
}
