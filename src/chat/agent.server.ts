import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { createAI } from "agents/models/ai-sdk";
import { convertToModelMessages, isStepCount, pruneMessages, streamText } from "ai";

import { getListRepository } from "~/db/lists.server";

import { chatRequestBodySchema } from "./chat";
import { createTodoTools } from "./tools.server";

// The chat assistant: a Durable Object per user (instance name = user id, chosen by src/server.ts from the authenticated user, never by the client).
// AIChatAgent persists the chat history in the Durable Object's SQLite storage and streams the answers over a WebSocket (resumable).
export class TodoChatAgent extends AIChatAgent<Env> {
    // the instance name (the user's email) is sent to the user's own clients only
    static options = { sendIdentityOnConnect: true };
    maxPersistedMessages = 200;

    async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
        const userId = this.name;
        const body = chatRequestBodySchema.catch({}).parse(options?.body ?? {});
        const currentList = body.currentListId ? await getListRepository().get(userId, body.currentListId) : undefined;

        // keyless: Workers AI or a third-party model via AI Gateway (Unified Billing), billed through the Cloudflare account
        const ai = createAI({ binding: this.env.AI, id: this.env.AI_GATEWAY_ID });

        const result = streamText({
            model: ai(this.env.AI_MODEL),
            system: systemPrompt({ today: body.today ?? new Date().toISOString().slice(0, 10), currentList }),
            messages: pruneMessages({
                messages: await convertToModelMessages(this.messages),
                reasoning: "before-last-message",
                toolCalls: "before-last-2-messages",
            }),
            tools: createTodoTools(userId),
            stopWhen: isStepCount(10),
            abortSignal: options?.abortSignal,
        });
        return result.toUIMessageStreamResponse();
    }
}

function systemPrompt({ today, currentList }: { today: string; currentList: { id: string; name: string } | undefined }) {
    return [
        "You are the assistant of a todo app. You manage the user's todo lists and todos with the provided tools.",
        "Reply in the language the user writes in. Keep replies short; don't show ids to the user.",
        `Today is ${today} (${new Date(`${today}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", timeZone: "UTC" })}). Resolve relative dates like "tomorrow" or "next Friday" from it. Due dates are calendar dates (YYYY-MM-DD).`,
        currentList
            ? `The user is currently looking at the list "${currentList.name}" (id ${currentList.id}). Add new todos to this list unless the user names another one.`
            : "The user isn't looking at a list right now. If it's unclear which list is meant, look up the lists and ask.",
        "To change or delete a todo, find it first. If several todos match, ask which one is meant.",
        "Deleting asks the user for confirmation in the chat; just call the tool.",
    ].join("\n");
}
