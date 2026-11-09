import { useCallback, useEffect, useRef } from "react";
import { type SubmitTarget, useFetcher, useSubmit } from "react-router";

import type { IntentInput, IntentResponse, IntentResult, Intents } from "~/intents";

// the submitted JSON; the input is validated by the action
function body(intent: string, input: unknown) {
    return { intent, input } as SubmitTarget;
}

// previousData: the fetcher's data before the submission (it is kept after a redirect)
type Pending = { resolve: (result: unknown) => void; reject: (error: Error) => void; previousData: IntentResponse | undefined };

// Submits the intents of a route action (see src/intents.ts) with a fetcher. `action`: the URL of the route, e.g. href("/lists/:listId", ...).
//
// submit: resolves with the intent's result once the action and the reload of the page data are done; undefined if the intent redirected.
// Rejects if the intent failed. The submissions of a component run one after another (a fetcher would cancel the running one).
// send: for changes that must also be made when the component unmounts (e.g. saving the unsaved changes when leaving a note), without result.
export function useIntents<I extends Intents>(action: string) {
    const fetcher = useFetcher<IntentResponse>();
    const pending = useRef<Pending | null>(null);
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const submitWithoutFetcher = useSubmit();

    // the fetcher is back to idle: its data is the result of the action (a new object for every action), unless the action redirected
    const { state, data, submit: submitWithFetcher } = fetcher;
    useEffect(() => {
        if (state !== "idle" || !pending.current) {
            return;
        }
        const { resolve, reject, previousData } = pending.current;
        pending.current = null;
        if (data === previousData) {
            resolve(undefined);
        } else if (data && "failed" in data) {
            reject(new Error(`Action ${action} failed`));
        } else {
            resolve(data?.result);
        }
    }, [state, data, action]);

    // the current data, for the next submission's previousData
    const currentData = useRef(data);
    currentData.current = data;
    const submit = useCallback(
        <Name extends keyof I & string>(intent: Name, input: IntentInput<I[Name]>) => {
            const run = () =>
                new Promise<unknown>((resolve, reject) => {
                    pending.current = { resolve, reject, previousData: currentData.current };
                    void submitWithFetcher(body(intent, input), { method: "post", action, encType: "application/json" });
                });
            const result = queue.current.then(run);
            queue.current = result.catch(() => {});
            return result as Promise<IntentResult<I[Name]> | undefined>;
        },
        [submitWithFetcher, action],
    );

    const send = useCallback(
        <Name extends keyof I & string>(intent: Name, input: IntentInput<I[Name]>) => {
            void submitWithoutFetcher(body(intent, input), { method: "post", action, encType: "application/json", navigate: false });
        },
        [submitWithoutFetcher, action],
    );

    return { submit, send };
}
