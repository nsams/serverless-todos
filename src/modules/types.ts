import type { ComponentType } from "react";
import type { z } from "zod";

import type { ChatPage } from "~/chat/chat";
import type { OperationEffect, Operations } from "~/operations";

// The app consists of a core (app shell, authentication, chat assistant, MCP server, database connection) and feature modules.
// Everything that belongs to a module lives in its folder src/modules/<module>/: database schema, repositories, operations (used by
// the UI and as AI tools), server functions, routes, components. The core only knows the modules through the registries
// (src/modules/registry.ts, registry.server.ts) and the interfaces below.

// The part of a module the app shell uses (browser and server rendering)
export type AppModule = {
    // unique; key of the module's navigation data
    id: string;
    // shown in the app's sidebar
    navigation?: {
        // heading of the module's section in the sidebar
        title: string;
        // loaded by the app layout (src/routes/_app.tsx) for every page; the module reads it with useNavigationData
        loader: () => Promise<unknown>;
        // onNavigate: closes the sidebar on small screens
        Component: ComponentType<{ onNavigate: () => void }>;
    };
    chat?: {
        // example prompts shown in an empty chat
        suggestions?: string[];
    };
};

// The part of a module the server uses (chat assistant, MCP server)
export type ServerModule = {
    // the AppModule's id
    id: string;
    // the module's operations (src/operations.ts): the ones with AI metadata are the tools of the AI assistants
    operations: Operations;
    // guidance for the model: what the tools manage and how to use them (system prompt of the chat assistant, instructions of the MCP server)
    instructions: string[];
    // what the user is looking at in the app (e.g. the current list), for the system prompt of the chat assistant
    chatContext?(userId: string, page: ChatPage | undefined): Promise<string[]>;
};

// A tool for the AI assistants, independent of the AI framework: used by the chat assistant (src/chat/tools.server.ts, AI SDK)
// and the MCP server (src/mcp/mcp.server.ts). Created from the modules' operations (toolsFromOperations, src/operations.ts).
// Tools that throw report the error message to the model, which then tells the user.
export type AppTool<Input extends z.ZodType = z.ZodType> = {
    // the id of the module the tool belongs to
    module: string;
    // short human-readable name (shown by MCP clients)
    title: string;
    description: string;
    inputSchema: Input;
    // read: doesn't change data; write: creates or changes data; delete: deletes data, the user is asked to confirm
    effect: OperationEffect;
    // validates the input; a method (not a function property), so specific tools are assignable to AppTool<z.ZodType>
    execute(input: unknown): Promise<unknown>;
};
