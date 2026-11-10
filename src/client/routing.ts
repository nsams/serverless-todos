import { useMemo } from "react";
import {
    generatePath,
    type LoaderFunctionArgs,
    type NavigateOptions,
    type PathParam,
    replace,
    type ShouldRevalidateFunction,
    useLocation,
    useNavigate,
    useParams,
    useRevalidator,
    useRouteLoaderData,
} from "react-router";

import { type GridSearch, lastPageWithRows, parseGridSearch } from "~/gridSearch";
import { parseSearch, stringifySearch } from "~/searchParams";

// Typed routes for React Router's data mode (createBrowserRouter, src/client/router.tsx): a page's path, search params and loader are
// defined once, and the links (href), the loader and the page's hooks are typed by them. Renaming a path param or changing what a
// loader returns breaks the build at every use, not at runtime.

// The params of a path, e.g. { listId: string } for "/lists/:listId"
export type RouteParams<Path extends string> = { [Key in PathParam<Path>]: string };

// href(params, search): params are required if the path has any
type HrefArgs<Path extends string, Search> = [PathParam<Path>] extends [never]
    ? [params?: RouteParams<Path>, search?: Search]
    : [params: RouteParams<Path>, search?: Search];

type LoaderArgs<Path extends string, Search> = {
    params: RouteParams<Path>;
    // the search params, validated by the route's validateSearch
    search: Search;
    request: Request;
    // the route's href, e.g. to redirect to other search params
    href: (...args: HrefArgs<Path, Search>) => string;
};

export function defineRoute<const Path extends `/${string}`, Search extends object = Record<string, never>, Data = undefined>(definition: {
    // absolute path pattern, e.g. "/lists/:listId"
    path: Path;
    // reads the search params (untrusted input), e.g. validateGridSearch (src/gridSearch.ts)
    validateSearch?: (search: unknown) => Search;
    loader?: (args: LoaderArgs<Path, Search>) => Promise<Data>;
}) {
    const { path, loader } = definition;
    const validateSearch = definition.validateSearch ?? (() => ({}) as Search);
    // e.g. listRoute.href({ listId }, { page: 2 }) → "/lists/abc?page=2"
    const href = (...[params, search]: HrefArgs<Path, Search>) =>
        generatePath<string>(path, params) + stringifySearch((search ?? {}) as Record<string, unknown>);
    return {
        path,
        validateSearch,
        href,
        // for createBrowserRouter (e.g. `{ ...listRoute.route, Component: ListPage }`); the id is the path, so useLoaderData finds the
        // route's data
        route: {
            id: path,
            path,
            loader:
                loader &&
                (({ params, request }: LoaderFunctionArgs) =>
                    // the route matched, so its path's params are set
                    loader({ params: params as RouteParams<Path>, search: validateSearch(parseSearch(new URL(request.url).search)), request, href })),
        },
        // the route's params, on its page (or its error boundary)
        useParams: () => useParams() as RouteParams<Path>,
        // the route's search params, on its page
        useSearch: () => {
            const { search } = useLocation();
            return useMemo(() => validateSearch(parseSearch(search)), [search]);
        },
        // the data of the route's loader, on its page (or any page below it)
        useLoaderData: () => routeLoaderData<Data>(useRouteLoaderData(path), path),
    };
}

// The data of a module's navigation (e.g. the lists in the sidebar): loaded for every page of the app layout by a route of its own
// around the pages (src/client/router.tsx), so the module's sidebar and pages read it typed (useData) and it is only reloaded with
// the module's data (reloadModules)
export type NavigationData = { id: string; loader: () => Promise<unknown> };

export function defineNavigationData<Data>(moduleId: string, loader: () => Promise<Data>) {
    const id = `${moduleId}:navigation`;
    return {
        id,
        loader,
        useData: () => routeLoaderData<Data>(useRouteLoaderData(id), id),
    };
}

function routeLoaderData<Data>(data: unknown, routeId: string) {
    if (data === undefined) {
        throw new Error(`Route ${routeId} isn't rendered`);
    }
    return data as Data;
}

// For a grid's loader: the page of the search params is empty, but there are rows on earlier pages (e.g. after deleting the last row
// of the last page): redirects to the last page with rows (href: the URL with other search params)
export function redirectToLastPageWithRows<Search extends GridSearch>(
    search: Search,
    { rowsOnPage, totalCount }: { rowsOnPage: number; totalCount: number },
    href: (search: Search) => string,
) {
    const lastPage = lastPageWithRows(parseGridSearch(search, {}), rowsOnPage, totalCount);
    if (lastPage !== undefined) {
        throw replace(href({ ...search, page: lastPage || undefined }));
    }
}

// Which modules' data is being reloaded (reloadModules); undefined: no module's in particular (e.g. a navigation)
let reloadingModules: ReadonlySet<string> | undefined;

// Reloads the data of the given modules (their routes' loaders, incl. their navigation data) with a revalidation or a navigation, e.g.
// after the assistant changed todos, or with the navigation to the list just created. The loaders of other modules' routes (e.g. the
// notebooks in the sidebar) aren't run by the revalidation (moduleShouldRevalidate).
export async function reloadModules(modules: readonly string[], transition: () => Promise<void> | void) {
    reloadingModules = new Set([...(reloadingModules ?? []), ...modules]);
    try {
        await transition();
    } finally {
        reloadingModules = undefined;
    }
}

// Reloads a module's data after a change: revalidate() on the same page, navigate(to) to another one
export function useModuleRevalidator(moduleId: string) {
    const { revalidate } = useRevalidator();
    const navigate = useNavigate();
    return useMemo(
        () => ({
            revalidate: () => reloadModules([moduleId], revalidate),
            navigate: (to: string, options?: NavigateOptions) => reloadModules([moduleId], () => navigate(to, options)),
        }),
        [moduleId, revalidate, navigate],
    );
}

// The shouldRevalidate of a module's routes (set by src/client/router.tsx): reloaded with the module's data, not reloaded by
// a revalidation of other modules' data; otherwise as React Router decides, or by the route's own shouldRevalidate
export function moduleShouldRevalidate(moduleId: string, shouldRevalidate?: ShouldRevalidateFunction): ShouldRevalidateFunction {
    return (args) => {
        if (reloadingModules) {
            if (reloadingModules.has(moduleId)) {
                return true;
            }
            if (args.currentUrl.href === args.nextUrl.href && args.formMethod === undefined) {
                return false;
            }
        }
        return shouldRevalidate ? shouldRevalidate(args) : args.defaultShouldRevalidate;
    };
}
