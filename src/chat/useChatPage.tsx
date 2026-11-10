import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { z } from "zod";

import type { ChatPage, ChatPageDefinition } from "./chatPage";

// The page the user is looking at (src/chat/chatPage.ts), reported by the pages and read by the chat panel. Independent of the router:
// the root route renders ChatPageProvider around the pages and the chat panel.

type ChatPageStore = {
    get: () => ChatPage | undefined;
    set: (page: ChatPage | undefined) => void;
};

const ChatPageContext = createContext<ChatPageStore | null>(null);

function useChatPageStore() {
    const store = useContext(ChatPageContext);
    if (!store) {
        throw new Error("ChatPageProvider is missing");
    }
    return store;
}

export function ChatPageProvider({ children }: { children: ReactNode }) {
    // not React state: the chat panel reads it when it sends a message, nothing re-renders when the page changes
    const [store] = useState((): ChatPageStore => {
        let current: ChatPage | undefined;
        return {
            get: () => current,
            set: (page) => {
                current = page;
            },
        };
    });
    return <ChatPageContext.Provider value={store}>{children}</ChatPageContext.Provider>;
}

// Reports what the page shows, typed by the module's schema, e.g. useChatPage(todosChatPage, { listId: list.id })
export function useChatPage<Schema extends z.ZodType>(definition: ChatPageDefinition<Schema>, data: z.input<Schema>) {
    const store = useChatPageStore();
    // compared by value: a new object with the same data on every render is no change
    const json = JSON.stringify(data);
    useEffect(() => {
        const page: ChatPage = { module: definition.module, data: JSON.parse(json) };
        store.set(page);
        return () => {
            // the next page may have reported itself already
            if (store.get() === page) {
                store.set(undefined);
            }
        };
    }, [store, definition.module, json]);
}

// Returns the page currently shown (read when needed, e.g. on every chat message)
export function useChatPageGetter() {
    return useChatPageStore().get;
}
