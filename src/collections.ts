import { useNavigateAfterChange, useRevalidateModule } from "./moduleData";

// Helpers for the "collection" pages of the modules (a todo list, a notebook: a named container of items, listed in the sidebar)

// The collection a module's index page (e.g. /lists) redirects to: the user's first one, created if the user has none yet (only then:
// a visit of the index page doesn't write otherwise)
export async function defaultCollectionId(collections: Promise<{ id: string }[]>, createDefault: () => Promise<{ id: string }>) {
    const [first] = await collections;
    return (first ?? (await createDefault())).id;
}

// The create handler of a module's navigation (NavigationList): creates the collection and opens it, the sidebar is reloaded on the way
export function useCreateCollection(moduleId: string, create: (name: string) => Promise<{ id: string }>, path: (id: string) => string) {
    const navigate = useNavigateAfterChange(moduleId);
    return async (name: string) => {
        const { id } = await create(name);
        await navigate(path(id));
    };
}

// The rename and delete handlers of a collection page's header (CollectionHeader): both reload the module's data (e.g. the sidebar);
// after deleting, the module's index page (indexPath) shows the next collection
export function useCollectionHeaderActions(
    moduleId: string,
    {
        rename,
        delete: deleteCollection,
        indexPath,
    }: { rename: (name: string) => Promise<unknown>; delete: () => Promise<unknown>; indexPath: string },
) {
    const revalidate = useRevalidateModule(moduleId);
    const navigate = useNavigateAfterChange(moduleId);
    return {
        onRename: async (name: string) => {
            await rename(name);
            await revalidate();
        },
        onDelete: async () => {
            await deleteCollection();
            // leaves the page, so the deleted collection isn't loaded again
            await navigate(indexPath, { replace: true });
        },
    };
}
