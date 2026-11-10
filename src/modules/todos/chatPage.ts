import { z } from "zod";

import { defineChatPage } from "~/chat/chatPage";

import { todosModuleId } from "./moduleId";

// What a page of the todos module shows, for the chat assistant (src/chat/chatPage.ts): the list page reports its list
// (useChatPage), the server module turns it into context for the system prompt (chatContext in module.server.ts)
export const todosChatPage = defineChatPage(todosModuleId, z.object({ listId: z.string() }));
