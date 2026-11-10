import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import { errorMessage } from "~/errors";

import { useShowError } from "./ErrorSnackbar";

// A mutation without a form to show its error in (e.g. the done checkbox of a todo): an error is shown in the snackbar. Like every
// mutation it reloads the data it changes afterwards (src/api/client.ts), also after an error (e.g. the checkbox shows the stored state again).
// e.g. `const updateTodo = useMutate(todosApi.updateTodo.mutationOptions())`, then `updateTodo({ id, done: true })`
export function useMutate<Data, MutationError, Variables, Context>(
    options: UseMutationOptions<Data, MutationError, Variables, Context>,
    fallbackMessage?: string,
) {
    const showError = useShowError();
    const { mutateAsync } = useMutation(options);
    return (variables: Variables) => {
        // a ValidationError's message, otherwise the fallback
        mutateAsync(variables).catch((error: unknown) => showError(errorMessage(error, fallbackMessage)));
    };
}
