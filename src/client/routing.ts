import { useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { generatePath, type NavigateOptions, type PathParam, useLocation, useNavigate, useParams } from "react-router";

import { parseSearch, stringifySearch } from "~/searchParams";

// Typed routes for React Router's declarative mode (<Routes>, src/client/AppRoutes.tsx): a page's path and search params are defined once,
// and the links (href) and the page's hooks are typed by them. Renaming a path param or changing the search params breaks the build at
// every use, not at runtime.

// The params of a path, e.g. { listId: string } for "/lists/:listId"
export type RouteParams<Path extends string> = { [Key in PathParam<Path>]: string };

// href(params, search): params are required if the path has any
type HrefArgs<Path extends string, Search> = [PathParam<Path>] extends [never]
    ? [params?: RouteParams<Path>, search?: Search]
    : [params: RouteParams<Path>, search?: Search];

export function defineRoute<const Path extends `/${string}`, Search extends object = Record<string, never>>(definition: {
    // absolute path pattern, e.g. "/lists/:listId"
    path: Path;
    // reads the search params (untrusted input), e.g. validateGridSearch (src/gridSearch.ts)
    validateSearch?: (search: unknown) => Search;
}) {
    const { path } = definition;
    const validateSearch = definition.validateSearch ?? (() => ({}) as Search);
    return {
        path,
        validateSearch,
        // e.g. listRoute.href({ listId }, { page: 2 }) → "/lists/abc?page=2"
        href: (...[params, search]: HrefArgs<Path, Search>) =>
            generatePath<string>(path, params) + stringifySearch((search ?? {}) as Record<string, unknown>),
        // the route's params, on its page: the page is only rendered for its path, so its params are set
        useParams: () => useParams() as RouteParams<Path>,
        // the route's search params, on its page (the same object while they don't change)
        useSearch: () => {
            const { search } = useLocation();
            return useMemo(() => validateSearch(parseSearch(search)), [search]);
        },
    };
}

// Leaves the page: navigates and renders the new page right away, e.g. before reloading the module's data after deleting what the page
// shows (otherwise the page, still shown, would reload it and show "not found")
export function useLeavePage() {
    const navigate = useNavigate();
    return useCallback((to: string, options?: NavigateOptions) => flushSync(() => void navigate(to, options)), [navigate]);
}
