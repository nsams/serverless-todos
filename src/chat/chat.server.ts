import {
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
    isStepCount,
    pruneMessages,
    streamText,
    validateUIMessages,
} from "ai";

import { appName } from "~/app";
import { getChatContext, toolsInstructions } from "~/modules/registry.server";

import { chatDataPartSchemas, type ChatMessage, chatRequestBodySchema } from "./chat";
import { getChatMessageRepository } from "./db/chatMessages.server";
import { getChatModel } from "./model.server";
import { createChatTools } from "./tools.server";

// The chat assistant (POST /api/chat, src/server.ts routes the requests of the authenticated user here): runs the model with the tools of
// the modules and streams the answer (AI SDK UI message stream). The history is kept in the database per user (src/chat/db/), the
// client sends only the new message; the user id comes from the authentication, never from the client.
export async function handleChatRequest(request: Request, userId: string): Promise<Response> {
    if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }
    const model = getChatModel();
    if (!model) {
        return new Response("The assistant is not configured (AI_API_KEY)", { status: 503 });
    }
    const body = chatRequestBodySchema.safeParse(await request.json().catch(() => undefined));
    if (!body.success) {
        return new Response("Bad Request", { status: 400 });
    }

    const repository = getChatMessageRepository();
    const history = (await repository.list(userId)).map(({ message }) => message);
    const last = history.at(-1);
    let message: ChatMessage;
    try {
        [message] = await validateUIMessages<ChatMessage>({ messages: [body.data.message], dataSchemas: chatDataPartSchemas });
    } catch (error) {
        console.warn("Chat request denied: invalid message", error);
        return new Response("Bad Request", { status: 400 });
    }
    // a new message of the user, or the assistant's last message with the user's tool approvals
    const isApproval = message.role === "assistant" && message.id === last?.id;
    if (message.role !== "user" && !isApproval) {
        return new Response("Bad Request", { status: 400 });
    }
    const messages = isApproval ? [...history.slice(0, -1), message] : [...history, message];
    // saved right away, so it isn't lost if the answer fails
    await repository.save(userId, message);

    const context = await getChatContext(userId, body.data.page);
    const modelMessages = pruneMessages({
        messages: await convertToModelMessages(messages),
        reasoning: "before-last-message",
        toolCalls: "before-last-2-messages",
    });

    // The model's answer plus a data part after every tool that changed data, telling the client which modules' data to reload
    const stream = createUIMessageStream<ChatMessage>({
        originalMessages: messages,
        execute: ({ writer }) => {
            const result = streamText({
                model,
                system: systemPrompt({ today: body.data.today ?? new Date().toISOString().slice(0, 10), context }),
                messages: modelMessages,
                tools: createChatTools(userId, (module) =>
                    writer.write({ type: "data-changes", id: crypto.randomUUID(), data: { modules: [module] } }),
                ),
                stopWhen: isStepCount(10),
                // the user stopped the answer (or closed the page)
                abortSignal: request.signal,
            });
            writer.merge(result.toUIMessageStream({ onError: handleError }));
        },
        onEnd: async ({ responseMessage }) => {
            await repository.save(userId, responseMessage);
        },
        onError: handleError,
    });
    return createUIMessageStreamResponse({ stream });
}

// The error message for the chat
function handleError(error: unknown) {
    // the logs (e.g. Workers Logs) show only the stack of an Error: log the fields that say what went wrong
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

// Model request errors (AI SDK APICallError) carry the HTTP status and the response body (e.g. the provider's reason)
function errorLogFields(error: unknown) {
    const cause = unwrapError(error);
    if (!(cause instanceof Error)) {
        return { error: String(cause) };
    }
    const fields: Record<string, unknown> = { name: cause.name, message: cause.message };
    for (const key of ["statusCode", "code", "model", "url", "responseBody"]) {
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
