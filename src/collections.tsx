import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate } from "react-router";

import { PageLoading } from "./routes/root";
import type { Href } from "./routing";

// Helpers for the "collection" pages of the modules (a todo list, a notebook: a named container of items, listed in the sidebar)

// The index page of a module (e.g. /lists): redirects to the user's first collection, created if the user has none yet (only then:
// a visit doesn't write otherwise)
export function CollectionIndex<Collection extends { id: string }, QueryError, Key extends readonly unknown[]>({
    collections,
    createDefault,
    href,
}: {
    // the user's collections (the module's navigation data)
    collections: UseQueryOptions<Collection[], QueryError, Collection[], Key>;
    // creates the default collection (a mutation: the collections are reloaded afterwards, so the page redirects to it)
    createDefault: () => Promise<unknown>;
    href: (id: string) => Href;
}) {
    // read fresh, e.g. right after the collection shown before was deleted
    const { data, isFetchedAfterMount } = useQuery({ ...collections, staleTime: 0 });
    const first = isFetchedAfterMount ? data?.[0] : undefined;
    const empty = isFetchedAfterMount && data?.length === 0;
    useEffect(() => {
        if (empty) {
            void createDefault();
        }
        // once per empty result
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [empty]);
    return first ? <Navigate to={href(first.id)} replace /> : <PageLoading />;
}
