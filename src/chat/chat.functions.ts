import { createServerFn } from "@tanstack/react-start";

import { getChatMessageRepository } from "./db/chatMessages.server";

// The chat history of the user (the chat panel loads it when it is opened). As JSON: the messages' tool inputs and outputs are `unknown`,
// which the server function's types can't prove serializable (they are JSON, they were stored as JSON).
export const getChatMessages = createServerFn().handler(async ({ context: { user } }) => {
    const messages = await getChatMessageRepository().list(user.id);
    return JSON.stringify(messages.map(({ message }) => message));
});

export const clearChatMessages = createServerFn({ method: "POST" }).handler(async ({ context: { user } }) => {
    await getChatMessageRepository().clear(user.id);
});
