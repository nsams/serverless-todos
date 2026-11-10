import { QueryClient, type QueryKey, useQueryClient, useSuspenseQuery, type UseSuspenseQueryOptions } from "@tanstack/react-query";
import { useCallback, useDeferredValue } from "react";

import { useStableValue } from "~/components/useStableValue";
import { NotFoundError, ValidationError } from "~/errors";

// The data loaded from the REST API in TanStack Query's cache. Every query key of a module starts with the module's id
// (e.g. [todosModuleId, "lists"], see src/modules/todos/queries.ts), so a change reloads exactly the data of its module:
// after a change in the UI (useInvalidateModule, e.g. in useMutate) and after the assistant changed it (src/components/ChatPanel.tsx).
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Every change made in the app reloads its module's data, so the cache only misses changes made elsewhere (e.g. by an MCP
            // client): reloaded when the data is shown again or the window is focused after this time
            staleTime: 30_000,
            // Errors without data to show are shown by the nearest error boundary (src/client/errors.tsx); a failed reload keeps the
            // data shown
            throwOnError: (_error, query) => query.state.data === undefined,
            // errors of the operations (e.g. not found) won't change on a retry, network errors might
            retry: (failureCount, error) => !(error instanceof NotFoundError || error instanceof ValidationError) && failureCount < 3,
        },
    },
});

// Reloads the data of modules: the queries shown right away, the others when they are shown again
export async function invalidateModules(client: QueryClient, moduleIds: readonly string[]) {
    await Promise.all(moduleIds.map((moduleId) => client.invalidateQueries({ queryKey: [moduleId] })));
}

export function useInvalidateModule(moduleId: string) {
    const client = useQueryClient();
    return useCallback(() => invalidateModules(client, [moduleId]), [client, moduleId]);
}

// The main data of a page for its input (e.g. the list and the grid state in the URL), always defined: the page suspends while it is
// loaded for the first time (the app layout shows a progress indicator). For new input (e.g. the next page of the grid) the page keeps
// showing the data of the previous input until the new data is loaded (loading: true), like a navigation that waits for its data.
// If a reload doesn't find it anymore (e.g. the list was deleted by the assistant while shown), the page shows "not found".
export function usePageQuery<Input, Data, Key extends QueryKey>(
    query: (input: Input) => UseSuspenseQueryOptions<Data, Error, Data, Key>,
    input: Input,
) {
    // compared by value: the input is a new object on every render
    const currentInput = useStableValue(input);
    const shownInput = useDeferredValue(currentInput);
    const { data, error } = useSuspenseQuery(query(shownInput));
    if (error instanceof NotFoundError) {
        throw error;
    }
    return { data, loading: shownInput !== currentInput };
}
