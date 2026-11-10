import { z } from "zod";

import { defineChatPage } from "~/chat/chatPage";

import { notesModuleId } from "./moduleId";

// What a page of the notes module shows, for the chat assistant (src/chat/chatPage.ts): the notebook page reports its notebook, the
// note page also the note (useChatPage); the server module turns it into context for the system prompt (chatContext in module.server.ts)
export const notesChatPage = defineChatPage(notesModuleId, z.object({ notebookId: z.string(), noteId: z.string().optional() }));
