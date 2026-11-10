import { type QueryKey, useQueryClient, useSuspenseQuery, type UseSuspenseQueryOptions } from "@tanstack/react-query";
import { isNotFound, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

// The modules' data in TanStack Query's cache (src/router.tsx): every query key of a module starts with the module's id
// (e.g. [todosModuleId, "lists"], see src/modules/todos/queries.ts), so a change reloads exactly the data of its module:
// after a change in the UI (useInvalidateModule, useMutate) and after the assistant changed it (src/components/ChatPanel.tsx).

// Reloads the data of a module (the queries shown are reloaded right away, the others when they are shown again)
export function useInvalidateModule(moduleId: string) {
    const queryClient = useQueryClient();
    return useCallback(() => queryClient.invalidateQueries({ queryKey: [moduleId] }), [queryClient, moduleId]);
}

// The main data of a page: loaded by the route's loader (queryClient.fetchQuery: fresh data from the cache, otherwise loaded), kept up to
// date by the query. If a reload doesn't find it anymore (e.g. the note was deleted by the assistant while open), the loaders run again:
// the page's loader loads it again (the query is stale) and the router shows the route's not found page.
export function usePageQuery<Data, Key extends QueryKey>(options: UseSuspenseQueryOptions<Data, Error, Data, Key>) {
    const router = useRouter();
    const { data, error } = useSuspenseQuery(options);
    const notFound = isNotFound(error);
    useEffect(() => {
        if (notFound) {
            void router.invalidate();
        }
    }, [notFound, router]);
    return data;
}
