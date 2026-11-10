import { useEffect, useMemo } from "react";
import { data, type LoaderFunctionArgs, type PathParam, type RouteObject, useLocation, useParams, useRouteLoaderData } from "react-router";

import { appName } from "~/app";
import { NotFoundError } from "~/errors";

import { parseSearch, stringifySearch } from "./searchParams";

// Typed routes for React Router data mode (src/router.tsx), which has no typed links, params or loader data of its own: a route is
// defined once with defineRoute (path, search params, loader), its page and links use what defineRoute returns. Renaming a path param
// or changing the loader's data breaks the build at every use, not the page.

// The params of a path, e.g. { listId: string } for "/lists/:listId"
export type PathParams<Path extends string> = { [Key in PathParam<Path>]: string };

type LoaderArgs<Path extends string, Search> = {
    params: PathParams<Path>;
    // the request's search params, validated by the route's validateSearch
    search: Search;
    // e.g. its signal, passed on to the API to cancel the request
    request: Request;
};

// A loader and a typed hook for its data: the route id ties the hook to this loader
export function defineLoader<Data>(id: string, loader: (args: LoaderFunctionArgs) => Promise<Data>) {
    return {
        id,
        loader,
        // the loader data of the route, from any component of the page or the layouts above it
        useLoaderData: () => useRouteLoaderData(id) as Data,
    };
}

// A page's route: its absolute path (e.g. "/lists/:listId"), how its search params are read (e.g. validateGridSearch) and its loader. The
// module mounts `route` with its page (`lazy`, see e.g. src/modules/todos/module.ts); the page reads its data with useLoaderData.
export function defineRoute<const Path extends string, Data, Search = Record<never, never>>({
    path,
    // a route without search params gets an empty object
    validateSearch = () => ({}) as Search,
    loader,
}: {
    path: Path;
    // untrusted input: invalid values are dropped
    validateSearch?: (search: unknown) => Search;
    // a NotFoundError (e.g. from the API: the list doesn't exist (anymore)) becomes a 404 of the route, shown by the nearest error boundary
    loader: (args: LoaderArgs<Path, Search>) => Promise<Data>;
}) {
    const { loader: routeLoader, useLoaderData } = defineLoader(path, async ({ params, request }) => {
        try {
            // the route matched the path, so it has its params
            return await loader({ params: params as PathParams<Path>, search: validateSearch(parseSearch(new URL(request.url).search)), request });
        } catch (error) {
            if (error instanceof NotFoundError) {
                throw data(null, { status: 404 });
            }
            throw error;
        }
    });

    return {
        route: { id: path, path, loader: routeLoader } satisfies RouteObject,
        // the URL of the page, e.g. listRoute.href({ listId }), with search params listRoute.href({ listId }, { page: 2 })
        href: (params: PathParams<Path>, search?: Search) => buildPath(path, params) + stringifySearch(search ?? {}),
        useLoaderData,
        useParams: () => useParams() as PathParams<Path>,
        // the search params of the current location
        useSearch: () => {
            const { search } = useLocation();
            return useMemo(() => validateSearch(parseSearch(search)), [search]);
        },
        validateSearch,
    };
}

// e.g. "/lists/:listId" with { listId: "a/b" } → "/lists/a%2Fb" (React Router's generatePath doesn't encode the params)
function buildPath<Path extends string>(path: Path, params: PathParams<Path>) {
    const values: Partial<Record<string, string>> = params;
    return path.replace(/:(\w+)/g, (_match, name: string) => encodeURIComponent(values[name] ?? ""));
}

// The page title, e.g. "Work – Todos"; without a name just the app name
export function usePageTitle(name?: string) {
    useEffect(() => {
        document.title = name ? `${name} – ${appName}` : appName;
    }, [name]);
}
