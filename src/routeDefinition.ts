import type { PathParam } from "react-router";

import { stringifySearch } from "./searchParams";

// Typed definitions of the app's pages: path, params, search params and route id. Shared by the app (links, src/routing.ts for
// the hooks) and the server (route ids in the chat context, ServerModule.chatContext), so no React code here.

// The params of a path, e.g. { listId: string } for "/lists/:listId"
export type RouteParams<Path extends string> = { [Key in PathParam<Path>]: string };

// href(params, search): params are required if the path has any
type HrefArgs<Path extends string, Search> = [PathParam<Path>] extends [never]
    ? [params?: RouteParams<Path>, search?: Search]
    : [params: RouteParams<Path>, search?: Search];

export type RouteDefinition<Path extends string = string, Search = unknown> = {
    // stable id of the page, sent to the chat assistant with the params (ChatPage in src/chat/chat.ts); only needed by pages the
    // modules give the assistant context for
    id?: string;
    // absolute path pattern, e.g. "/lists/:listId"
    path: Path;
    // reads the page's search params (untrusted input), e.g. validateGridSearch of src/gridSearch.ts
    validateSearch: (search: unknown) => Search;
    // the URL of the page, e.g. listRoute.href({ listId }, { page: 2 }) → "/lists/abc?page=2"
    href: (...args: HrefArgs<Path, Search>) => string;
};

export function defineRoute<const Path extends `/${string}`, Search extends object = Record<string, never>>({
    id,
    path,
    validateSearch = () => ({}) as Search,
}: {
    id?: string;
    path: Path;
    validateSearch?: (search: unknown) => Search;
}): RouteDefinition<Path, Search> {
    return {
        id,
        path,
        validateSearch,
        href: (...[params, search]) => buildPath(path, params ?? {}) + stringifySearch((search ?? {}) as Record<string, unknown>),
    };
}

// "/lists/:listId" + { listId: "a b" } → "/lists/a%20b"
function buildPath(path: string, params: Record<string, string>) {
    return path.replace(/:(\w+)/g, (_match, name: string) => encodeURIComponent(params[name] ?? ""));
}
