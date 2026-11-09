import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Close, Delete } from "@dextinity/admin-icons";
import { Alert, Box, IconButton, Toolbar, Tooltip, Typography } from "@mui/material";
import { ChatBox } from "@mui/x-chat";
import type { ChatAdapter, ChatMessage, ChatMessagePart } from "@mui/x-chat/headless";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useMemo, useRef } from "react";
import { matchRoutes, useLocation } from "react-router";

import { invalidate } from "~/api/client";
import { chatAgentPath, type ChatPage, type ChatRequestBody } from "~/chat/chat";
import { toDateString } from "~/dates";
import { appModules, appPages } from "~/modules/registry";

const suggestions = appModules.flatMap((module) => module.chat?.suggestions ?? []);
// tools that change data: the page data is reloaded after they ran
const mutatingToolNames: ReadonlySet<string> = new Set(appModules.flatMap((module) => module.chat?.mutatingToolNames ?? []));

// The pages the assistant gets context for (with a route id, see RouteDefinition)
const chatPageRoutes = appPages.flatMap(({ route }) => (route.id === undefined ? [] : [{ id: route.id, path: route.path }]));

// The page shown at a path: its route id and params (e.g. { routeId: "todos/list", params: { listId } })
function chatPage(pathname: string): ChatPage | undefined {
    const match = matchRoutes(chatPageRoutes, pathname)?.at(-1);
    if (!match) {
        return undefined;
    }
    const params = Object.entries(match.params).flatMap(([key, value]) => (value === undefined ? [] : [[key, value] as const]));
    return { routeId: match.route.id, params: Object.fromEntries(params) };
}

// The chat with the assistant (src/chat/agent.server.ts).
//
// useAgentChat (WebSocket to the user's ChatAgent) owns the conversation: history (persisted by the agent), streaming, resuming
// after reconnects, tool approvals. MUI X Chat only renders it: its messages are controlled by useAgentChat's messages and its adapter
// forwards sending, stopping and approvals to useAgentChat.
export default function ChatPanel({ onClose }: { onClose: () => void }) {
    // The page shown in the app, sent with every message
    const { pathname } = useLocation();
    const currentPage = useRef<ChatPage | undefined>(undefined);
    useEffect(() => {
        currentPage.current = chatPage(pathname);
    }, [pathname]);

    // the server picks the agent instance of the authenticated user (src/server.ts)
    const agent = useAgent({ agent: "ChatAgent", basePath: chatAgentPath });
    const { messages, sendMessage, stop, addToolApprovalResponse, clearHistory, error } = useAgentChat({
        agent,
        // read on every request
        body: (): ChatRequestBody => ({ today: toDateString(new Date()), page: currentPage.current }),
    });

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

    // Reload the data (e.g. the lists in the sidebar, the todos of the page) after the assistant changed something: the tools
    // of all modules can change anything, so all queries are invalidated
    const handledToolCallIds = useRef(new Set<string>());
    useEffect(() => {
        let changed = false;
        for (const message of messages) {
            for (const part of message.parts) {
                if (
                    isToolUIPart(part) &&
                    part.state === "output-available" &&
                    mutatingToolNames.has(getToolName(part)) &&
                    !handledToolCallIds.current.has(part.toolCallId)
                ) {
                    handledToolCallIds.current.add(part.toolCallId);
                    changed = true;
                }
            }
        }
        if (changed) {
            void invalidate();
        }
    }, [messages]);

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
function toChatMessage(message: UIMessage): ChatMessage {
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
