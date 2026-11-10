import type { Hono } from "hono";
import type { ComponentType } from "react";
import type { RouteObject } from "react-router";
import type { z } from "zod";

import type { ApiEnv } from "~/api/hono.server";
import type { ChatContext } from "~/chat/chatPage";
import type { NavigationData } from "~/client/routing";
import type { OperationEffect, Operations } from "~/operations";

// The app consists of a core (app shell, authentication, chat assistant, MCP server, database connection) and feature modules.
// Everything that belongs to a module lives in its folder src/modules/<module>/: database schema, repositories, operations (used by
// the REST API and as AI tools), REST API, routes (pages), components. The core only knows the modules through the registries
// (src/modules/registry.ts, registry.server.ts) and the interfaces below.

// The part of a module the app shell uses (browser)
export type AppModule = {
    // unique: the ServerModule's id, the path of its REST API (/api/<id>)
    id: string;
    // the module's pages (React Router, see src/client/routing.ts), rendered in the app layout (src/client/AppLayout.tsx); pages that only
    // redirect (a loader without a component) are mounted outside it (src/client/router.tsx). They are reloaded with the module's data
    // only (reloadModules).
    routes: RouteObject[];
    // shown in the app's sidebar
    navigation?: {
        // heading of the module's section in the sidebar
        title: string;
        // the data of the sidebar (e.g. the lists), loaded for every page of the app layout (defineNavigationData)
        data: NavigationData;
        // onNavigate: closes the sidebar on small screens
        Component: ComponentType<{ onNavigate: () => void }>;
    };
    chat?: {
        // example prompts shown in an empty chat
        suggestions?: string[];
    };
};

// The part of a module the server uses (REST API, chat assistant, MCP server)
export type ServerModule = {
    // the AppModule's id
    id: string;
    // the module's operations (src/operations.ts): the ones with AI metadata are the tools of the AI assistants
    operations: Operations;
    // the module's REST API for the app, a thin adapter over the operations, mounted at /api/<id> (src/api/api.server.ts)
    api?: Hono<ApiEnv>;
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
