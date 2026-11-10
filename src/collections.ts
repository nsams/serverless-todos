import type { FetchQueryOptions, QueryClient, QueryKey } from "@tanstack/react-query";
import { type NavigateOptions, useNavigate } from "@tanstack/react-router";

import { useInvalidateModule } from "./moduleQueries";

// Helpers for the "collection" pages of the modules (a todo list, a notebook: a named container of items, listed in the sidebar)

// The collection a module's index page (e.g. /lists) redirects to: the user's first one, created if the user has none yet.
// Read fresh (e.g. right after deleting the collection shown). Not created while preloading (a preload must not change data):
// undefined then, the index page is loaded again when it is opened.
export async function defaultCollectionId<Collection extends { id: string }, TError, Key extends QueryKey>(
    queryClient: QueryClient,
    {
        collectionsQuery,
        createDefault,
        preload,
    }: {
        // the user's collections (the module's navigation data)
        collectionsQuery: FetchQueryOptions<Collection[], TError, Collection[], Key>;
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

// The create handler of a module's navigation (NavigationList): creates the collection and opens it (open: e.g. the link of the
// collection's page), the module's data (e.g. the sidebar) is reloaded on the way
export function useCreateCollection(moduleId: string, create: (name: string) => Promise<{ id: string }>, open: (id: string) => NavigateOptions) {
    const navigate = useNavigate();
    const invalidate = useInvalidateModule(moduleId);
    return async (name: string) => {
        const { id } = await create(name);
        await invalidate(() => navigate(open(id)));
    };
}

// The rename and delete handlers of a collection page's header (CollectionHeader): both reload the module's data (e.g. the sidebar);
// after deleting, the module's index page (index) shows the next collection
export function useCollectionHeaderActions(
    moduleId: string,
    {
        rename,
        delete: deleteCollection,
        index,
    }: { rename: (name: string) => Promise<unknown>; delete: () => Promise<unknown>; index: NavigateOptions },
) {
    const navigate = useNavigate();
    const invalidate = useInvalidateModule(moduleId);
    return {
        onRename: async (name: string) => {
            await rename(name);
            await invalidate();
        },
        onDelete: async () => {
            await deleteCollection();
            await invalidate(() => navigate({ ...index, replace: true }));
        },
    };
}
