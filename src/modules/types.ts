import type { AnyRouter } from "@trpc/server";
import type { RouteObject } from "react-router";
import type { z } from "zod";

import type { ChatContext } from "~/chat/chatPage";
import type { ModuleNavigation } from "~/navigation";
import type { OperationEffect, Operations } from "~/operations";

// The app consists of a core (app shell, authentication, API, chat assistant, MCP server, database connection) and feature modules.
// Everything that belongs to a module lives in its folder src/modules/<module>/: database schema, repositories, operations (used by
// the UI through the module's API and as AI tools), API router and client, routes, pages, components. The core only knows the modules
// through the registries (src/modules/registry.ts, registry.server.ts) and the interfaces below.

// The part of a module the app shell uses (browser)
export type AppModule = {
    // unique; the path of the module's API router (src/api/router.server.ts), the module of its chat pages and AI tools, and the key
    // the app reloads the module's data by (src/moduleData.ts)
    id: string;
    // the module's pages (React Router route objects, created with defineRoute, src/routing.ts), mounted into the app layout (src/router.tsx)
    routes: RouteObject[];
    // shown in the app's sidebar; created with defineNavigation (src/navigation.tsx)
    navigation?: ModuleNavigation;
    chat?: {
        // example prompts shown in an empty chat
        suggestions?: string[];
    };
};

// The part of a module the server uses (API, chat assistant, MCP server)
export type ServerModule = {
    // the AppModule's id
    id: string;
    // the module's operations (src/operations.ts): the ones with AI metadata are the tools of the AI assistants
    operations: Operations;
    // the module's API for its pages: a tRPC router over the operations the UI uses, mounted under the module's id (src/api/router.server.ts)
    api?: AnyRouter;
    // guidance for the model: what the tools manage and how to use them (system prompt of the chat assistant, instructions of the MCP server)
    instructions: string[];
    // what the user is looking at in the app (e.g. the current list), for the system prompt of the chat assistant; created with
    // defineChatContext from the module's page schema (src/chat/chatPage.ts)
    chatContext?: ChatContext;
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
