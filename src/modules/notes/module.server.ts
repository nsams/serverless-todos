import type { ServerModule } from "~/modules/types";

import { getNotebookRepository } from "./db/notebooks.server";
import { getNoteRepository } from "./db/notes.server";
import { notebooksApi } from "./notebooks.api.server";
import { notesApi } from "./notes.api.server";
import { notebookRouteId, noteRouteId } from "./paths";
import { createNoteTools, noteToolsInstructions } from "./tools.server";

// The notes module (notebooks and Markdown notes), server part. App shell part: module.ts.
export const notesServerModule = {
    api: { notebooks: notebooksApi, notes: notesApi },
    createTools: createNoteTools,
    instructions: noteToolsInstructions,
    chatContext: async (userId, page) => {
        if (page?.routeId === noteRouteId && page.params.noteId) {
            const note = await getNoteRepository().get(userId, page.params.noteId);
            if (note) {
                return [
                    `The user is currently looking at the note "${note.title}" (id ${note.id}, notebook id ${note.notebookId}). "This note" refers to it: read it with getNote.`,
                ];
            }
        }
        if ((page?.routeId === notebookRouteId || page?.routeId === noteRouteId) && page.params.notebookId) {
            const notebook = await getNotebookRepository().get(userId, page.params.notebookId);
            if (notebook) {
                return [
                    `The user is currently looking at the notebook "${notebook.name}" (id ${notebook.id}). Add new notes to this notebook unless the user names another one.`,
                ];
            }
        }
        return [];
    },
} satisfies ServerModule;
