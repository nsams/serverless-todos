import { data, redirect, type RouterContextProvider } from "react-router";
import type { z } from "zod";

import { userContext } from "./context";
import { NotFoundError, ValidationError } from "./errors";
import { lastPageWithRows, parseGridSearch, validateGridSearch } from "./gridSearch";
import { type Operation, runOperation } from "./operations";
import { parseSearch, stringifySearch } from "./searchParams";

// The API layer of the app: React Router loaders and actions run the modules' operations (src/operations.ts) as the authenticated user.
// The operations' errors are mapped here, once: in loaders NotFoundError → 404 page; in the operations' API route NotFoundError → 404,
// ValidationError → 422 with the message for the form (thrown again on the client by useOperations).

// The error of a failed operation as returned by the operations' API route (src/routes/api.ts); the client throws it again as
// NotFoundError or ValidationError (useOperations, src/modules/client.ts)
export type OperationError = { type: "notFound" | "validation"; message: string };

// The operation's error for the client; rethrows unexpected errors (500). An expected outcome of a submission (e.g. an empty name), so it
// is answered with status 200 (the browser would log a 4xx response as a failed request); the route's clientAction reports it to React
// Router as 422 or 404, so the page data isn't reloaded.
export function operationError(error: unknown): { error: OperationError } {
    if (error instanceof NotFoundError) {
        return { error: { type: "notFound", message: error.message } };
    }
    if (error instanceof ValidationError) {
        return { error: { type: "validation", message: error.message } };
    }
    throw error;
}

// Runs an operation in a loader with untrusted input (params, search params), e.g. the todos of a list: a missing entity is a 404 page
export async function loadOperation<Input extends z.ZodType, Output>(
    operation: Operation<Input, Output>,
    context: Readonly<RouterContextProvider>,
    input: unknown,
): Promise<Output> {
    try {
        return await runOperation(operation, { userId: context.get(userContext).id }, input);
    } catch (error) {
        if (error instanceof NotFoundError) {
            throw data(error.message, 404);
        }
        throw error;
    }
}

// Loads a page of a grid whose state is in the URL (src/gridSearch.ts), e.g. the todos of a list: runs the grid's operation with the
// search params and the route's params (its input schema validates them). An empty page with rows on earlier pages (e.g. after deleting
// the last row of the last page) redirects to the last page with rows.
export async function loadGridOperation<Input extends z.ZodType, Output extends { totalCount: number }>(
    operation: Operation<Input, Output>,
    { context, url }: { context: Readonly<RouterContextProvider>; url: URL },
    params: Record<string, string>,
    rows: (output: Output) => unknown[],
): Promise<Output> {
    const search = parseSearch(url.search);
    const output = await loadOperation(operation, context, { ...search, ...params });
    const lastPage = lastPageWithRows(parseGridSearch(validateGridSearch(search), {}), rows(output).length, output.totalCount);
    if (lastPage !== undefined) {
        throw redirect(url.pathname + stringifySearch({ ...search, page: lastPage || undefined }));
    }
    return output;
}
