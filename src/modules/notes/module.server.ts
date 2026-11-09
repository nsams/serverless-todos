import type { FileRoutesById } from "~/client/routeTree.gen";
import type { ServerModule } from "~/modules/types";

import { getNotebookRepository } from "./db/notebooks.server";
import { getNoteRepository } from "./db/notes.server";
import { createNoteTools, noteToolsInstructions } from "./tools.server";

// The pages of a notebook and of a note (the chat assistant gets the route id of the page shown, src/chat/chat.ts)
const notebookRouteId: keyof FileRoutesById = "/_app/notes/$notebookId/";
const noteRouteId: keyof FileRoutesById = "/_app/notes/$notebookId/$noteId";

// The notes module (notebooks and Markdown notes), server part (REST API: api.server.ts). App shell part: module.ts.
export const notesServerModule: ServerModule = {
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
};
