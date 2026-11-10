import { data, redirect } from "react-router";

import { userContext } from "~/context";
import { storeOperationOutcome } from "~/modules/client";
import { findOperation } from "~/modules/registry.server";
import { runOperation } from "~/operations";
import { operationError } from "~/routeOperations.server";

import type { Route } from "./+types/api";

// The modules' operations for the UI (resource route): POST /api/<module>/<operation> with the operation's input as JSON, submitted with
// useOperations (src/modules/client.ts). Not tied to a page, so any component can change any module's data, and React Router reloads
// the page's data afterwards. Only changes (effect write or delete): pages read their data in their loaders.
// ?redirectTo=<path>: goes there afterwards (e.g. away from the page of a deleted list), see useOperations' runAndNavigate.
export async function action({ params, request, url, context }: Route.ActionArgs) {
    const operation = findOperation(params.module, params.operation);
    if (!operation || operation.effect === "read") {
        throw new Response(null, { status: 404 });
    }
    let result: unknown;
    try {
        result = await runOperation(operation, { userId: context.get(userContext).id }, await request.json());
    } catch (error) {
        return operationError(error);
    }
    const redirectTo = url.searchParams.get("redirectTo");
    // only paths of the app (no open redirect: browsers read "//host" and "/\host" as another host)
    if (redirectTo?.startsWith("/") && !redirectTo.startsWith("//") && !redirectTo.startsWith("/\\")) {
        throw redirect(redirectTo);
    }
    return { result };
}

// In the browser: hands the result (or the error) to the useOperations call that submitted it. A failed submission (server or network error)
// is reported to the caller (e.g. the snackbar) instead of replacing the page by the error boundary, e.g. the note editor keeps its changes.
export async function clientAction({ request, serverAction }: Route.ClientActionArgs) {
    const call = new URL(request.url).searchParams.get("call") ?? "";
    try {
        const outcome = await serverAction();
        storeOperationOutcome(call, outcome);
        // a failed operation (e.g. an empty name): nothing changed, React Router doesn't reload the page data after a failed action
        if ("error" in outcome) {
            return data(null, outcome.error.type === "notFound" ? 404 : 422);
        }
    } catch (error) {
        // the redirect after the operation (redirectTo): React Router follows it
        if (error instanceof Response) {
            storeOperationOutcome(call, { redirected: true });
            throw error;
        }
        storeOperationOutcome(call, { failed: error });
    }
    return null;
}
