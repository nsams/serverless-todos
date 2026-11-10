import { useChat } from "@ai-sdk/react";
import { Close, Delete } from "@dextinity/admin-icons";
import { Alert, Box, IconButton, Toolbar, Tooltip, Typography } from "@mui/material";
import { ChatBox } from "@mui/x-chat";
import type { ChatAdapter, ChatMessage as MuiChatMessage, ChatMessagePart } from "@mui/x-chat/headless";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { DefaultChatTransport, getToolName, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useMemo, useState } from "react";

import { type ChatMessage, chatPath, type ChatRequestBody } from "~/chat/chat";
import { clearChatMessages, getChatMessages } from "~/chat/chat.functions";
import { useChatChanges } from "~/chat/useChatChanges";
import { useChatPageGetter } from "~/chat/useChatPage";
import { useShowError } from "~/components/ErrorSnackbar";
import { toDateString } from "~/dates";
import { invalidateModules } from "~/moduleQueries";
import { appModules } from "~/modules/registry";

const suggestions = appModules.flatMap((module) => module.chat?.suggestions ?? []);

// The chat with the assistant (src/chat/chat.server.ts).
//
// The AI SDK's useChat owns the conversation: streaming, tool approvals. The history is kept by the server (loaded when the panel is
// opened, the client sends only the new message). MUI X Chat only renders it: its messages are controlled by useChat's messages and its
// adapter forwards sending, stopping and approvals to useChat.
export default function ChatPanel({ onClose }: { onClose: () => void }) {
    const queryClient = useQueryClient();
    const router = useRouter();
    // what the user is looking at (reported by the page with useChatPage)
    const getChatPage = useChatPageGetter();

    // the history, once when the panel is opened (the panel stays mounted, useChat keeps the conversation from then on)
    const { data: initialMessages } = useSuspenseQuery({
        queryKey: ["chat", "messages"],
        queryFn: async () => JSON.parse(await getChatMessages()) as ChatMessage[],
        staleTime: Infinity,
    });
    const [transport] = useState(
        () =>
            new DefaultChatTransport<ChatMessage>({
                api: chatPath,
                // the new message only (the server keeps the history); read on every request
                prepareSendMessagesRequest: ({ messages }) => {
                    const body: ChatRequestBody = { message: messages.at(-1), today: toDateString(new Date()), page: getChatPage() };
                    return { body };
                },
            }),
    );
    const { messages, sendMessage, stop, addToolApprovalResponse, setMessages, error } = useChat<ChatMessage>({
        messages: initialMessages,
        transport,
        // after the user approved or denied a tool call (e.g. a deletion), the assistant continues
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });
    const showError = useShowError();

    const clearHistory = () => {
        clearChatMessages().then(
            () => setMessages([]),
            () => showError("Clearing the chat failed, please try again."),
        );
    };

    // A tool changed the data of modules (reported by the assistant, src/chat/chat.server.ts): reload exactly their data (the keys of a
    // module's queries start with its id, src/moduleQueries.ts)
    useChatChanges(messages, (modules) => void invalidateModules(queryClient, router, modules));

    const adapter = useMemo(
        (): ChatAdapter => ({
            sendMessage: async ({ message, signal }) => {
                // the reply is rendered from useChat's messages, the stream only tells MUI X Chat when the turn is over
                const done = sendMessage({
                    id: message.id,
                    role: "user",
                    parts: message.parts.flatMap((part) => (part.type === "text" ? [{ type: "text", text: part.text }] : [])),
                });
                signal.addEventListener("abort", () => stop(), { once: true });
                return new ReadableStream({
                    start: (controller) => {
                        done.then(
                            () => controller.close(),
                            (sendError: unknown) => controller.error(sendError),
                        );
                    },
                });
            },
            stop: () => stop(),
            addToolApprovalResponse: async ({ id, approved, reason }) => {
                await addToolApprovalResponse({ id, approved, reason });
            },
        }),
        [sendMessage, stop, addToolApprovalResponse],
    );

    const chatMessages = useMemo(() => messages.map(toChatMessage), [messages]);

    return (
        <Box sx={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
            <Toolbar variant="dense" sx={{ gap: 1, borderBottom: 1, borderColor: "divider" }}>
                <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
                    Assistant
                </Typography>
                <Tooltip title="Clear chat">
                    <span>
                        <IconButton aria-label="Clear chat" onClick={() => clearHistory()} disabled={messages.length === 0}>
                            <Delete />
                        </IconButton>
                    </span>
                </Tooltip>
                <IconButton edge="end" aria-label="Close assistant" onClick={onClose}>
                    <Close />
                </IconButton>
            </Toolbar>
            {error && (
                <Alert severity="error" sx={{ borderRadius: 0 }}>
                    {error.message || "The assistant is not available."}
                </Alert>
            )}
            <ChatBox
                adapter={adapter}
                messages={chatMessages}
                features={{ conversationList: false, conversationHeader: false, attachments: false }}
                variant="compact"
                slots={{ messageAvatar: null }}
                suggestions={messages.length === 0 && suggestions.length > 0 ? suggestions : undefined}
                suggestionsAutoSubmit
                sx={{ flexGrow: 1, minHeight: 0, border: 0, borderRadius: 0 }}
            />
        </Box>
    );
}

// AI SDK UI message → MUI X Chat message (the part types mostly match, tool parts are nested differently)
function toChatMessage(message: ChatMessage): MuiChatMessage {
    return {
        id: message.id,
        role: message.role,
        parts: message.parts.flatMap((part): ChatMessagePart[] => {
            if (isToolUIPart(part)) {
                const toolInvocation = {
                    toolCallId: part.toolCallId,
                    toolName: getToolName(part),
                    state: part.state,
                    input: part.input,
                    output: part.output,
                    errorText: part.errorText,
                    approvalId: part.approval?.id,
                    approval: part.approval?.approved !== undefined ? { approved: part.approval.approved, reason: part.approval.reason } : undefined,
                };
                return [part.type === "dynamic-tool" ? { type: "dynamic-tool", toolInvocation } : { type: "tool", toolInvocation }];
            }
            switch (part.type) {
                case "text":
                case "reasoning":
                    return [{ type: part.type, text: part.text, state: part.state }];
                case "step-start":
                    return [part];
                default:
                    // files, sources and data parts aren't used by the assistant
                    return [];
            }
        }),
    };
}
