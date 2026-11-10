import { defineChatContext } from "~/chat/chatPage";
import { defineServerModule } from "~/modules/types";

import { notesChatPage } from "./chatPage";
import { getNotebookRepository } from "./db/notebooks.server";
import { getNoteRepository } from "./db/notes.server";
import { notesModuleId } from "./moduleId";
import { noteInstructions, noteOperations } from "./operations.server";

// The notes module (notebooks and Markdown notes), server part (picked up by src/modules/registry.server.ts). App shell part: module.ts.
export default defineServerModule({
    id: notesModuleId,
    operations: noteOperations,
    // the user's notebooks with their number of notes (sidebar), see client.ts
    navigation: (ctx) => noteOperations.listNotebooks.handler(ctx, {}),
    instructions: noteInstructions,
    chatContext: defineChatContext(notesChatPage, async (userId, page) => {
        if (page?.noteId) {
            const note = await getNoteRepository().get(userId, page.noteId);
            if (note) {
                return [
                    `The user is currently looking at the note "${note.title}" (id ${note.id}, notebook id ${note.notebookId}). "This note" refers to it: read it with getNote.`,
                ];
            }
        }
        if (page) {
            const notebook = await getNotebookRepository().get(userId, page.notebookId);
            if (notebook) {
                return [
                    `The user is currently looking at the notebook "${notebook.name}" (id ${notebook.id}). Add new notes to this notebook unless the user names another one.`,
                ];
            }
        }
        return [];
    }),
});
