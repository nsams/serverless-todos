import { defineChatContext } from "~/chat/chatPage";
import type { ServerModule } from "~/modules/types";

import { notesChatPage } from "./chatPage";
import { getNotebookRepository } from "./db/notebooks.server";
import { getNoteRepository } from "./db/notes.server";
import { notesModuleId } from "./moduleId";
import { noteInstructions, noteOperations } from "./operations.server";

// The notes module (notebooks and Markdown notes), server part. App shell part: module.ts.
export const notesServerModule: ServerModule = {
    id: notesModuleId,
    operations: noteOperations,
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
};
