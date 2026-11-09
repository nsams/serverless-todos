import { type ActionFunctionArgs, type ClientActionFunctionArgs, data } from "react-router";
import type { z } from "zod";

import type { User } from "./auth.server";
import { userContext } from "./context";

// Mutations are route actions with named intents, e.g. the action of a todo list: rename the list, delete it, create a todo, ...
// The client submits { intent, input } as JSON with a fetcher (useIntents, src/components/useIntents.ts), the action validates the input with
// the intent's schema and runs its handler (intentAction). Afterwards React Router reloads the data of the page (all loaders, e.g. also the
// sidebar's lists of the app layout). A handler can also throw a redirect, e.g. to leave the page of a deleted list.

export type IntentArgs = {
    // the authenticated user (src/root.tsx)
    user: User;
    // the route's params, e.g. the list id
    params: Record<string, string | undefined>;
    // the URL the intent was submitted to (e.g. with the grid state in the search params)
    url: URL;
};

export type Intent<Input extends z.ZodType = z.ZodType, Result = unknown> = {
    input: Input;
    // a method (not a function property), so specific intents are assignable to Intent<z.ZodType>
    handler(input: z.output<Input>, args: IntentArgs): Promise<Result>;
};

export type Intents = Record<string, Intent>;

// Infers the input type of the handler from the input schema
export function defineIntent<Input extends z.ZodType, Result>(input: Input, handler: (input: z.output<Input>, args: IntentArgs) => Promise<Result>) {
    return { input, handler } satisfies Intent<Input, Result>;
}

export type IntentInput<I extends Intent> = z.input<I["input"]>;
export type IntentResult<I extends Intent> = Awaited<ReturnType<I["handler"]>>;

// What the action returns to the fetcher: a new object for every submission (also when the handler returns nothing)
export type IntentResponse = { result: unknown } | { failed: true };

// The route's action (server)
export function intentAction(intents: Intents) {
    return async ({ request, context, params, url }: ActionFunctionArgs): Promise<IntentResponse> => {
        const body = (await request.json().catch(() => null)) as { intent?: unknown; input?: unknown } | null;
        const intent = typeof body?.intent === "string" && Object.hasOwn(intents, body.intent) ? intents[body.intent] : undefined;
        if (!intent) {
            throw data("Unknown intent", { status: 400 });
        }
        const input = intent.input.safeParse(body?.input);
        if (!input.success) {
            throw data("Invalid input", { status: 400 });
        }
        return { result: await intent.handler(input.data, { user: context.get(userContext), params, url }) };
    };
}

// The route's clientAction (browser): a failed intent (server error, network error) is reported to the caller (useIntents rejects, e.g. the
// caller shows the error snackbar) instead of replacing the page by the error boundary, e.g. the note editor keeps its unsaved changes
export async function clientIntentAction({ serverAction }: ClientActionFunctionArgs): Promise<IntentResponse> {
    try {
        return await serverAction<IntentResponse>();
    } catch (error) {
        // redirects (thrown by a handler)
        if (error instanceof Response) {
            throw error;
        }
        console.error(error);
        return { failed: true };
    }
}
