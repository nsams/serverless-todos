import { type QueryKey, usePrefetchQuery, useSuspenseQuery, type UseSuspenseQueryOptions } from "@tanstack/react-query";
import { type ComponentType, lazy, useEffect, useMemo } from "react";
import { type PathParam, useLocation, useParams } from "react-router";

import { queryClient } from "~/api/client";
import { appName } from "~/app";
import { NotFoundError } from "~/errors";

import { parseSearch, stringifySearch } from "./searchParams";

// Typed routes for React Router's declarative mode (src/router.tsx), which has no typed links, params or search params of its own: a
// route is defined once with defineRoute (path, search params, the page's query, its lazily loaded page), its page and links use what
// defineRoute returns. Renaming a path param or changing the query's data breaks the build at every use, not the page.

// The params of a path, e.g. { listId: string } for "/lists/:listId"
export type PathParams<Path extends string> = { [Key in PathParam<Path>]: string };

declare const hrefBrand: unique symbol;

// The URL of a page of the app, made by its route (route.href, route.link): links in the shared components (e.g. NavigationList) take
// an Href, not a hand-written string
export type Href = string & { readonly [hrefBrand]: true };

// A link to a page: its URL and what it loads (preloaded when the link is hovered or focused, see linkProps)
export type RouteLink = { href: Href; preload: () => void };

// href(params, search): params are required if the path has any
type HrefArgs<Path extends string, Search> = [PathParam<Path>] extends [never]
    ? [params?: PathParams<Path>, search?: Search]
    : [params: PathParams<Path>, search?: Search];

type RouteArgs<Path extends string, Search> = { params: PathParams<Path>; search: Search };

// The route's mount point for the router (AppModule.routes)
export type AppRoute = { path: string; Component: ComponentType };

type RouteDefinition<Path extends string, Search, Data, QueryError, Key extends QueryKey> = {
    // absolute path pattern, e.g. "/lists/:listId"
    path: Path;
    // reads the search params (untrusted input, invalid values are dropped), e.g. validateGridSearch; none by default
    validateSearch?: (search: unknown) => Search;
    // The page's data, e.g. `({ params: { listId }, search }) => todosApi.listTodos.queryOptions({ listId, ...search })`: loaded while
    // the page's code loads (no waterfall), when a link to the page is hovered (link), and read by the page with useData
    query?: (args: RouteArgs<Path, Search>) => UseSuspenseQueryOptions<Data, QueryError, Data, Key>;
} & (
    | {
          // the page, loaded with the route (code splitting): `() => import("./pages/list")` (the default export)
          page: () => Promise<{ default: ComponentType }>;
      }
    | {
          // a page that is part of the main bundle, e.g. a redirect
          Component: ComponentType;
      }
);

export function defineRoute<
    const Path extends `/${string}`,
    Search = Record<never, never>,
    Data = never,
    QueryError = Error,
    Key extends QueryKey = QueryKey,
>(definition: RouteDefinition<Path, Search, Data, QueryError, Key>) {
    const { path, query } = definition;
    // a route without search params gets an empty object
    const validateSearch = definition.validateSearch ?? (() => ({}) as Search);
    const Page = "page" in definition ? lazy(definition.page) : definition.Component;

    const href = (...[params, search]: HrefArgs<Path, Search>) => (buildPath(path, params ?? {}) + stringifySearch(search ?? {})) as Href;

    // the params and search params of the page (only used by the route's own page, mounted at its path by the router)
    function useRouteParams() {
        return useParams() as PathParams<Path>;
    }

    function useSearch() {
        const { search } = useLocation();
        return useMemo(() => validateSearch(parseSearch(search)), [search]);
    }

    function useData(): Data {
        if (!query) {
            throw new Error(`The route ${path} has no query`);
        }
        const { data, error } = useSuspenseQuery(query({ params: useRouteParams(), search: useSearch() }));
        // e.g. deleted by the assistant while the page is open: the 404 page instead of the outdated data
        if (error instanceof NotFoundError) {
            throw error;
        }
        return data;
    }

    // The router renders the page in a transition (the previous page stays until the new one is ready): its query starts with the
    // page's code, the page suspends until both are there
    const withQuery = (pageQuery: NonNullable<typeof query>) =>
        function RouteComponent() {
            usePrefetchQuery(pageQuery({ params: useRouteParams(), search: useSearch() }));
            return <Page />;
        };

    return {
        path,
        Component: query ? withQuery(query) : Page,
        // the URL of the page, e.g. listRoute.href({ listId }), with search params listRoute.href({ listId }, { page: 2 })
        href,
        // a link to the page that preloads its code and data, e.g. for NavigationList
        link: (...args: HrefArgs<Path, Search>): RouteLink => ({
            href: href(...args),
            preload: () => {
                if ("page" in definition) {
                    void definition.page();
                }
                if (query) {
                    const [params, search] = args;
                    void queryClient.prefetchQuery(query({ params: params ?? ({} as PathParams<Path>), search: search ?? validateSearch({}) }));
                }
            },
        }),
        useParams: useRouteParams,
        useSearch,
        // the page's data (query), loaded before the page is shown
        useData,
        validateSearch,
    };
}

// e.g. "/lists/:listId" with { listId: "a/b" } → "/lists/a%2Fb" (React Router's generatePath doesn't encode the params)
function buildPath(path: string, params: Partial<Record<string, string>>) {
    return path.replace(/:(\w+)/g, (_match, name: string) => encodeURIComponent(params[name] ?? ""));
}

// Props for a react-router Link (e.g. `<Button component={Link} {...linkProps(link)}>`): preloads the page on hover and focus
export function linkProps({ href, preload }: RouteLink) {
    return { to: href, onMouseEnter: preload, onFocus: preload };
}

// The page title, e.g. "Work – Todos"; without a name just the app name
export function usePageTitle(name?: string) {
    useEffect(() => {
        document.title = name ? `${name} – ${appName}` : appName;
    }, [name]);
}
