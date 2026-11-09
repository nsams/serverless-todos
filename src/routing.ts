import { useEffect, useMemo } from "react";
import { data, useLoaderData, useLocation } from "react-router";

import { isNotFoundError } from "~/api/client";
import { appName } from "~/app";

import { parseSearch } from "./searchParams";

// Helpers for the pages (React Router data mode, see src/router.tsx)

// The search params of a loader's request, e.g. for a route's validateSearch
export function requestSearch(request: Request) {
    return parseSearch(new URL(request.url).search);
}

// Loads a page's data; a NOT_FOUND error of the API (e.g. a list that doesn't exist (anymore)) becomes a 404 of the route,
// shown by the nearest error boundary (RouteError in src/routes/root.tsx, or the route's own)
export async function loadOrNotFound<T>(promise: Promise<T>) {
    try {
        return await promise;
    } catch (error) {
        if (isNotFoundError(error)) {
            throw data(null, { status: 404 });
        }
        throw error;
    }
}

// The loader data of the current route, typed by its loader (the data isn't serialized in data mode: e.g. Dates stay Dates)
export function useLoaderResult<Loader extends (...args: never[]) => unknown>() {
    return useLoaderData() as Awaited<ReturnType<Loader>>;
}

// The search params of the current location, validated by the route's validateSearch (e.g. validateGridSearch)
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
