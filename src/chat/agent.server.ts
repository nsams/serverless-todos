import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, pruneMessages, streamText } from "ai";

import { appName } from "~/app";
import { getChatContext, toolsInstructions } from "~/modules/registry.server";

import { type ChatMessage, chatRequestBodySchema } from "./chat";
import { getChatModel } from "./model.server";
import { createChatTools } from "./tools.server";

// The chat assistant: a Durable Object per user (instance name = user id, chosen by src/server.ts from the authenticated user, never by the client).
// AIChatAgent persists the chat history in the Durable Object's SQLite storage and streams the answers over a WebSocket (resumable).
export class ChatAgent extends AIChatAgent<Env> {
    // the instance name (the user's email) is sent to the user's own clients only
    static options = { sendIdentityOnConnect: true };
    maxPersistedMessages = 200;

    async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
        const userId = this.name;
        const body = chatRequestBodySchema.catch({}).parse(options?.body ?? {});
        const context = await getChatContext(userId, body.page);

        const messages = pruneMessages({
            messages: await convertToModelMessages(this.messages),
            reasoning: "before-last-message",
            toolCalls: "before-last-2-messages",
        });

        // The model's answer plus a data part after every tool that changed data, telling the client which modules' data to reload
        const stream = createUIMessageStream<ChatMessage>({
            execute: ({ writer }) => {
                const result = streamText({
                    model: getChatModel(this.env),
                    system: systemPrompt({ today: body.today ?? new Date().toISOString().slice(0, 10), context }),
                    messages,
                    tools: createChatTools(userId, (module) =>
                        writer.write({ type: "data-changes", id: crypto.randomUUID(), data: { modules: [module] } }),
                    ),
                    stopWhen: isStepCount(10),
                    abortSignal: options?.abortSignal,
                });
                writer.merge(result.toUIMessageStream({ onError: handleError }));
            },
            onError: handleError,
        });
        return createUIMessageStreamResponse({ stream });
    }
}

// The error message for the chat
function handleError(error: unknown) {
    // Workers Logs show only the stack of an Error: log the fields that say what went wrong
    console.error("Chat assistant error", errorLogFields(error));
    // details only in development (they may contain internals)
    return import.meta.env.DEV ? errorDetails(error) : "The assistant is not available.";
}

// context: what the user is looking at, from the modules
function systemPrompt({ today, context }: { today: string; context: string[] }) {
    return [
        `You are the assistant of the app "${appName}". You help the user with the provided tools.`,
        "Reply in the language the user writes in. Keep replies short.",
        `Today is ${today} (${new Date(`${today}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", timeZone: "UTC" })}).`,
        ...context,
        ...toolsInstructions,
        "Deleting asks the user for confirmation in the chat; just call the tool.",
    ].join("\n");
}

// The error of the model request: retries wrap it
function unwrapError(error: unknown): unknown {
    return error instanceof Error && "lastError" in error ? unwrapError(error.lastError) : error;
}

// Model request errors (AI SDK APICallError, CloudflareAIError) carry the HTTP status, the response body (e.g. the AI Gateway's reason)
// and Cloudflare's error code and AI Gateway log id
function errorLogFields(error: unknown) {
    const cause = unwrapError(error);
    if (!(cause instanceof Error)) {
        return { error: String(cause) };
    }
    const fields: Record<string, unknown> = { name: cause.name, message: cause.message };
    for (const key of ["statusCode", "code", "model", "url", "logId", "responseBody"]) {
        if (key in cause) {
            fields[key] = (cause as unknown as Record<string, unknown>)[key];
        }
    }
    if (error !== cause) {
        fields.wrappedIn = String(error);
    }
    return fields;
}

// For the chat in development
function errorDetails(error: unknown): string {
    error = unwrapError(error);
    if (error instanceof Error && "responseBody" in error && error.responseBody) {
        return `${error.message}: ${String(error.responseBody)}`;
    }
    return String(error);
}
