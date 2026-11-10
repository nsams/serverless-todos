import type { FetchQueryOptions, QueryClient, QueryKey } from "@tanstack/react-query";

// Helpers for the "collection" pages of the modules (a todo list, a notebook: a named container of items, listed in the sidebar)

// The collection a module's index page (e.g. /lists) redirects to: the user's first one, created if the user has none yet.
// Read fresh (e.g. right after deleting the collection shown). Not created while preloading (a preload must not change data):
// undefined then, the index page is loaded again when it is opened.
export async function defaultCollectionId<Collection extends { id: string }, Key extends QueryKey>(
    queryClient: QueryClient,
    {
        collectionsQuery,
        createDefault,
        preload,
    }: {
        // the user's collections (the module's navigation data)
        collectionsQuery: FetchQueryOptions<Collection[], Error, Collection[], Key>;
        createDefault: () => Promise<{ id: string }>;
        preload: boolean;
    },
) {
    const [first] = await queryClient.fetchQuery({ ...collectionsQuery, staleTime: 0 });
    if (first || preload) {
        return first?.id;
    }
    const { id } = await createDefault();
    await queryClient.invalidateQueries({ queryKey: collectionsQuery.queryKey });
    return id;
}
