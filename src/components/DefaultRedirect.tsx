import { type QueryKey, useMutation, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { type ComponentType, useEffect, useRef } from "react";
import { Navigate } from "react-router";

import { PageLoading } from "~/client/errors";
import { useInvalidateModule } from "~/client/queries";

type Options<Collection extends { id: string }, Key extends QueryKey> = {
    // the module whose collections they are: its data is reloaded after creating the default one (e.g. the new list in the sidebar)
    moduleId: string;
    // the user's collections (the module's navigation data)
    collectionsQuery: UseQueryOptions<Collection[], Error, Collection[], Key>;
    // creates the user's default collection (if the user has none)
    createDefault: () => Promise<{ id: string }>;
    // the page of a collection, e.g. (listId) => listRoute.href({ listId })
    href: (id: string) => string;
};

// The page of a module's collections (e.g. /lists; a collection is a named container of items listed in the sidebar, e.g. a todo list):
// redirects to the user's first one, created if the user has none yet
export function defaultCollectionPage<Collection extends { id: string }, Key extends QueryKey>({
    moduleId,
    collectionsQuery,
    createDefault,
    href,
}: Options<Collection, Key>): ComponentType {
    return function DefaultCollectionRedirect() {
        // read fresh, e.g. right after deleting the collection redirected to before: the cached collections are reloaded first
        const { data: collections, isFetchedAfterMount } = useQuery({ ...collectionsQuery, refetchOnMount: "always" });
        const invalidate = useInvalidateModule(moduleId);
        // creating is a change: a mutation, not part of the query (a query may run again any time, e.g. when the window is focused)
        const { mutate: create, data: created } = useMutation({ mutationFn: createDefault, onSuccess: () => invalidate(), throwOnError: true });
        const missing = isFetchedAfterMount && collections?.length === 0;
        // once (React's StrictMode runs effects twice in development)
        const creating = useRef(false);
        useEffect(() => {
            if (missing && !creating.current) {
                creating.current = true;
                create();
            }
        }, [missing, create]);

        const id = isFetchedAfterMount ? (collections?.[0]?.id ?? created?.id) : undefined;
        return id === undefined ? <PageLoading /> : <Navigate to={href(id)} replace />;
    };
}
