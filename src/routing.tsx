import { type QueryKey, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";

import { isNotFoundError } from "~/api/client";
import { appName } from "~/app";

import { PageLoading } from "./components/PageLoading";
import type { RouteDefinition, RouteParams } from "./routeDefinition";
import { parseSearch } from "./searchParams";

// Helpers for the pages (React Router declarative mode, see src/router.tsx; the data comes from TanStack Query, see src/api/client.ts)

// useQuery for the data of a page: a NOT_FOUND of the API (e.g. a list that doesn't exist (anymore)) and errors without data to show
// are thrown to the nearest error boundary (RouteErrorBoundary in src/routes/root.tsx: 404 or error page within the app layout).
// Errors of a reload while there is data (e.g. after a change) keep showing the data.
export function useApiQuery<QueryFnData, Error, Data, Key extends QueryKey>(options: UseQueryOptions<QueryFnData, Error, Data, Key>) {
    const result = useQuery(options);
    if (result.error && (isNotFoundError(result.error) || result.data === undefined)) {
        throw result.error;
    }
    return result;
}

// The params of the current page, typed by its route definition (e.g. listRoute.path "/lists/:listId" → { listId: string })
export function useRouteParams<Path extends string>(route: Pick<RouteDefinition<Path>, "path">): RouteParams<Path> {
    const match = useMatch(route.path);
    if (!match) {
        throw new Error(`The current location doesn't match ${route.path}`);
    }
    return match.params as RouteParams<Path>;
}

// The search params of the current location, validated by the route's validateSearch (e.g. validateGridSearch)
export function useRouteSearch<Search>(route: Pick<RouteDefinition<string, Search>, "validateSearch">) {
    return useSearch(route.validateSearch);
}

export function useSearch<Search>(validateSearch: (search: unknown) => Search) {
    const { search } = useLocation();
    return useMemo(() => validateSearch(parseSearch(search)), [search, validateSearch]);
}

// The page title, e.g. "Work – Todos"; without a name just the app name
export function usePageTitle(name?: string) {
    useEffect(() => {
        document.title = name ? `${name} – ${appName}` : appName;
    }, [name]);
}

// A page that redirects to a page determined by the server, e.g. /lists to the user's first list (created if the user has none:
// a mutation, so not a query). to: the target's URL; errors are shown by the nearest error boundary.
export function RedirectTo({ to }: { to: () => Promise<string> }) {
    const navigate = useNavigate();
    const [error, setError] = useState<{ error: unknown }>();
    useEffect(() => {
        let active = true;
        to().then(
            (path) => {
                if (active) {
                    void navigate(path, { replace: true });
                }
            },
            (error: unknown) => {
                if (active) {
                    setError({ error });
                }
            },
        );
        return () => {
            active = false;
        };
        // only once per visit (e.g. the default list is created once)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (error) {
        throw error.error;
    }
    return <PageLoading />;
}
