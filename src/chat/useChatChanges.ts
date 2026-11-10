import { useEffect, useRef } from "react";

import type { ChatMessage } from "./chat";

// Calls onChange with the modules whose data the assistant's tools changed (the agent's "changes" data parts, src/chat/chat.ts),
// once per change, so the client reloads their data. Independent of the data loading: the caller invalidates (e.g. the router's
// loaders, or the modules' queries). Changes in the history that is there when the chat opens are not reported (the page data
// was loaded after them).
export function useChatChanges(messages: ChatMessage[], onChange: (modules: string[]) => void) {
    const handledIds = useRef<Set<string> | null>(null);
    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    });

    useEffect(() => {
        const isFirstRun = handledIds.current === null;
        const handled = (handledIds.current ??= new Set());
        const modules = new Set<string>();
        for (const message of messages) {
            for (const part of message.parts) {
                if (part.type === "data-changes" && part.id !== undefined && !handled.has(part.id)) {
                    handled.add(part.id);
                    for (const module of part.data.modules) {
                        modules.add(module);
                    }
                }
            }
        }
        if (!isFirstRun && modules.size > 0) {
            onChangeRef.current([...modules]);
        }
    }, [messages]);
}
