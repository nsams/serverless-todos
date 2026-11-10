import { z } from "zod";

// What the user is looking at in the app, for the chat assistant (e.g. the open todo list as default list for new todos).
// Each module declares the context of its pages with a schema (e.g. src/modules/todos/chatPage.ts), the pages report what they show
// (useChatPage, src/chat/useChatPage.tsx), the chat panel sends it with every message and the module turns it into context for the
// system prompt (ServerModule.chatContext, created with defineChatContext). The server doesn't depend on routes: renaming a context
// field breaks the build, not the assistant.

export type ChatPageDefinition<Schema extends z.ZodType = z.ZodType> = {
    // the id of the module whose page it is
    module: string;
    schema: Schema;
};

export function defineChatPage<Schema extends z.ZodType>(module: string, schema: Schema): ChatPageDefinition<Schema> {
    return { module, schema };
}

// The page as sent by the client: the module validates the data with its schema (defineChatContext)
export const chatPageSchema = z.object({ module: z.string(), data: z.unknown() });

export type ChatPage = z.infer<typeof chatPageSchema>;

// Context for the system prompt from the page shown (undefined: no page reported, e.g. the start page)
export type ChatContext = (userId: string, page: ChatPage | undefined) => Promise<string[]>;

// A module's chat context: gets its own pages' data, validated with its schema (undefined for other modules' pages or invalid data)
export function defineChatContext<Schema extends z.ZodType>(
    definition: ChatPageDefinition<Schema>,
    context: (userId: string, page: z.output<Schema> | undefined) => Promise<string[]>,
): ChatContext {
    return (userId, page) => {
        const parsed = page?.module === definition.module ? definition.schema.safeParse(page.data) : undefined;
        return context(userId, parsed?.success ? parsed.data : undefined);
    };
}
