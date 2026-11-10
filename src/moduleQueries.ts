import {
    type FetchQueryOptions,
    type QueryClient,
    type QueryKey,
    useQueryClient,
    useSuspenseQuery,
    type UseSuspenseQueryOptions,
} from "@tanstack/react-query";
import { type AnyRouter, notFound, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

import { moduleQueryFilter } from "~/api/client";
import { NotFoundError } from "~/errors";

// The modules' data in TanStack Query's cache (src/api/client.ts): the key of every query of a module starts with the module's id
// (its API router is mounted there), so a change reloads exactly the data of its module: after a change in the UI (useInvalidateModule,
// useMutate) and after the assistant changed it (src/components/ChatPanel.tsx).

// Reloads the data of modules: the queries shown right away, the others when they are shown again. Then the route loaders run again,
// e.g. for the page title (they read the reloaded queries from the cache, no further requests).
export async function invalidateModules(queryClient: QueryClient, router: AnyRouter, moduleIds: string[]) {
    await Promise.all(moduleIds.map((moduleId) => queryClient.invalidateQueries(moduleQueryFilter(moduleId))));
    await router.invalidate();
}

// Reloads the module's data after a change. navigate: goes to another page after the change (e.g. the created list, or away from the
// deleted one). The module's data is marked outdated first: the next page's loader loads it fresh, the page left isn't loaded again
// (e.g. the deleted list), and what the next page didn't load (e.g. the sidebar) is reloaded after the navigation.
export function useInvalidateModule(moduleId: string) {
    const queryClient = useQueryClient();
    const router = useRouter();
    return useCallback(
        async (navigate?: () => Promise<void>) => {
            if (!navigate) {
                await invalidateModules(queryClient, router, [moduleId]);
                return;
            }
            const filter = moduleQueryFilter(moduleId);
            await queryClient.invalidateQueries({ ...filter, refetchType: "none" });
            await navigate();
            // not again what the next page is loading already (its loader, its queries mounting with outdated data)
            await queryClient.refetchQueries({ ...filter, type: "active", stale: true }, { cancelRefetch: false });
        },
        [queryClient, router, moduleId],
    );
}

// Loads the main data of a page in its route's loader (fresh data from the cache, otherwise loaded); a NotFoundError (e.g. a list that
// doesn't exist (anymore)) becomes the route's not found page
export async function loadPageQuery<Data, TError, Key extends QueryKey>(
    queryClient: QueryClient,
    options: FetchQueryOptions<Data, TError, Data, Key>,
) {
    try {
        return await queryClient.fetchQuery(options);
    } catch (error) {
        if (error instanceof NotFoundError) {
            throw notFound();
        }
        throw error;
    }
}

// The main data of a page, loaded by the route's loader (loadPageQuery) and kept up to date by the query. If a reload doesn't find it
// anymore (e.g. the note was deleted by the assistant while open), the loaders run again: the page's loader loads it again (the query
// is stale) and the router shows the route's not found page.
export function usePageQuery<Data, TError, Key extends QueryKey>(options: UseSuspenseQueryOptions<Data, TError, Data, Key>) {
    const router = useRouter();
    const { data, error } = useSuspenseQuery(options);
    const isNotFound = error instanceof NotFoundError;
    useEffect(() => {
        if (isNotFound) {
            void router.invalidate();
        }
    }, [isNotFound, router]);
    return data;
}
