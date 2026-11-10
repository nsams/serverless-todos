import { useCallback, useMemo } from "react";
import { href, type Register, type ShouldRevalidateFunction, type SubmitTarget, useRouteLoaderData, useSubmit } from "react-router";

import { NotFoundError, ValidationError } from "~/errors";
import type { OperationInput, OperationOutput } from "~/operations";
import type { OperationError } from "~/routeOperations.server";
import type { loader as appLayoutLoader } from "~/routes/_app";

import type { ServerModule } from "./types";

// A module's server data on the client, typed by its server module (a type-only import, so no server code reaches the browser):
// - useOperations<typeof todosServerModule>(todosModuleId): runs the module's operations (changes)
// - useNavigationData<typeof todosServerModule>(todosModuleId): the module's sidebar data
// The id is checked against the server module's id, so the type and the module can't get mixed up.

type ModuleOperations<Module extends ServerModule> = Module["operations"];

// What the operations' API route (src/routes/api.ts) answered to a submission, stored by its clientAction for the useOperations call
type OperationOutcome = { result: unknown } | { error: OperationError } | { redirected: true } | { failed: unknown };

const outcomes = new Map<string, OperationOutcome>();
let lastCall = 0;

export function storeOperationOutcome(call: string, outcome: OperationOutcome) {
    outcomes.set(call, outcome);
}

type Name<Module extends ServerModule> = keyof ModuleOperations<Module> & string;
type Input<Module extends ServerModule, N extends Name<Module>> = OperationInput<ModuleOperations<Module>[N]>;
type Output<Module extends ServerModule, N extends Name<Module>> = OperationOutput<ModuleOperations<Module>[N]>;

// Runs the module's operations (effect write or delete) through the operations' API route. Submissions are independent of the component:
// they finish when it unmounts (e.g. saving a note when leaving it). Both throw a ValidationError (message for the user, e.g. "Name is
// required") or NotFoundError like the operation, other errors for failures.
// - run("createList", { name }): resolves with the operation's result once React Router has reloaded the page's data (e.g. the new list
//   in the sidebar). revalidate: false keeps the page's data (e.g. autosaving a note: nothing else on the page changes).
// - runAndNavigate("deleteList", { listId }, href("/lists")): goes to the page afterwards (with its data and the layout's data), e.g. away
//   from the page of a deleted list, whose data can't be reloaded anymore
export function useOperations<Module extends ServerModule>(moduleId: Module["id"]) {
    const submit = useSubmit();
    const submitOperation = useCallback(
        async (name: string, input: unknown, { revalidate = true, redirectTo }: { revalidate?: boolean; redirectTo?: string }) => {
            const call = String(++lastCall);
            const search = new URLSearchParams({ call, ...(redirectTo !== undefined && { redirectTo }) });
            // the input is validated by the operation
            await submit(input as SubmitTarget, {
                method: "post",
                action: `${href("/api/:module/:operation", { module: moduleId, operation: name })}?${search}`,
                encType: "application/json",
                navigate: false,
                defaultShouldRevalidate: revalidate ? undefined : false,
            });
            const outcome = outcomes.get(call);
            outcomes.delete(call);
            if (outcome && "result" in outcome) {
                // decoded by React Router (e.g. Dates stay Dates)
                return outcome.result;
            }
            if (outcome && "redirected" in outcome) {
                return undefined;
            }
            if (outcome && "error" in outcome) {
                throw outcome.error.type === "notFound" ? new NotFoundError(outcome.error.message) : new ValidationError(outcome.error.message);
            }
            throw new Error(`Operation ${moduleId}.${name} failed`, { cause: outcome?.failed });
        },
        [submit, moduleId],
    );
    return useMemo(
        () => ({
            run: async <N extends Name<Module>>(name: N, input: Input<Module, N>, options: { revalidate?: boolean } = {}) =>
                // the result of this operation (src/routes/api.ts)
                (await submitOperation(name, input, options)) as Output<Module, N>,
            runAndNavigate: async <N extends Name<Module>>(name: N, input: Input<Module, N>, to: string) => {
                await submitOperation(name, input, { redirectTo: to });
            },
        }),
        [submitOperation],
    );
}

// The shouldRevalidate of a module's pages: React Router reloads every loader of the page after any change, but modules don't share data,
// so a module's page is only reloaded after changes of its own module (e.g. not when a notebook is created in the sidebar while a todo
// list is shown). Explicit reloads (e.g. after the assistant changed something) still reload it.
export function revalidateOnChangesOf(moduleId: string): ShouldRevalidateFunction {
    const operationsPath = href("/api/:module/:operation", { module: moduleId, operation: "" });
    return ({ formAction, defaultShouldRevalidate }) =>
        defaultShouldRevalidate && (formAction === undefined || !formAction.startsWith("/api/") || formAction.startsWith(operationsPath));
}

type NavigationData<Module extends ServerModule> = Awaited<ReturnType<NonNullable<Module["navigation"]>>>;

// The app layout's route id (src/routes.ts), checked against the route config by the typegen: moving the layout or giving it another id
// breaks the build
const appLayoutRouteId: Register["routeFiles"]["routes/_app.tsx"]["id"] = "routes/_app";

// The module's sidebar data (ServerModule.navigation), loaded by the app layout for every page (src/routes/_app.tsx)
export function useNavigationData<Module extends ServerModule>(moduleId: Module["id"]) {
    const navigation = useRouteLoaderData<typeof appLayoutLoader>(appLayoutRouteId)?.navigation;
    if (!navigation) {
        throw new Error("useNavigationData is used outside of the app layout");
    }
    // loaded by the module's navigation (registry.server.ts), turbo-stream keeps its types
    return navigation[moduleId] as NavigationData<Module>;
}
