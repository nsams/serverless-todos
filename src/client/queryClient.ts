import { QueryClient } from "@tanstack/react-query";

import { isHttpError } from "~/api/client";

// The cache of the data loaded from the REST API (TanStack Query). The pages and the sidebar load their data with queries
// (the modules' queries.ts); changes invalidate the queries of the data they changed (e.g. the module's query key), the chat
// panel invalidates all queries after the assistant changed data.
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Errors are shown by the nearest error boundary (src/client/errors.tsx), like the 404 of a list that doesn't
            // exist (anymore), also if the query had data before (e.g. the list was deleted by the assistant)
            throwOnError: true,
            // error responses of the API (e.g. 404) won't change on a retry, network errors might
            retry: (failureCount, error) => !isHttpError(error) && failureCount < 3,
        },
    },
});
