import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Close, Delete } from "@dextinity/admin-icons";
import { Alert, Box, IconButton, Toolbar, Tooltip, Typography } from "@mui/material";
import { ChatBox } from "@mui/x-chat";
import type { ChatAdapter, ChatMessage as MuiChatMessage, ChatMessagePart } from "@mui/x-chat/headless";
import { useRouter } from "@tanstack/react-router";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart } from "ai";
import { useMemo } from "react";

import { chatAgentPath, type ChatMessage, type ChatRequestBody } from "~/chat/chat";
import { useChatChanges } from "~/chat/useChatChanges";
import { toDateString } from "~/dates";
import { appModules } from "~/modules/registry";

const suggestions = appModules.flatMap((module) => module.chat?.suggestions ?? []);

// The chat with the assistant (src/chat/agent.server.ts).
//
// useAgentChat (WebSocket to the user's ChatAgent) owns the conversation: history (persisted by the agent), streaming, resuming
// after reconnects, tool approvals. MUI X Chat only renders it: its messages are controlled by useAgentChat's messages and its adapter
// forwards sending, stopping and approvals to useAgentChat.
export default function ChatPanel({ onClose }: { onClose: () => void }) {
    const router = useRouter();

    // the server picks the agent instance of the authenticated user (src/server.ts)
    const agent = useAgent({ agent: "ChatAgent", basePath: chatAgentPath });
    const { messages, sendMessage, stop, addToolApprovalResponse, clearHistory, error } = useAgentChat<unknown, ChatMessage>({
        agent,
        // read on every request
        body: (): ChatRequestBody => ({ today: toDateString(new Date()), page: currentPage(router) }),
    });

    // A tool changed the data of modules (reported by the agent, src/chat/agent.server.ts): reload the page data. The router's loaders
    // aren't split by module (the layout loads all modules' navigation data), so everything is reloaded.
    useChatChanges(messages, () => void router.invalidate());

    const adapter = useMemo(
        (): ChatAdapter => ({
            sendMessage: async ({ message, signal }) => {
                // the reply is rendered from useAgentChat's messages, the stream only tells MUI X Chat when the turn is over
                const done = sendMessage({ id: message.id, role: "user", parts: message.parts.filter((part) => part.type === "text") });
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

// The page shown in the app (the deepest route match)
function currentPage(router: ReturnType<typeof useRouter>): ChatRequestBody["page"] {
    const match = router.state.matches.at(-1);
    return match ? { routeId: match.routeId, params: match.params as Record<string, string> } : undefined;
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
