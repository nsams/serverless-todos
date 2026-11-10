import { useCallback } from "react";
import { useRevalidator } from "react-router";

import { errorMessage } from "~/errors";

import { useShowError } from "./ErrorSnackbar";

// Runs a change (e.g. an operation, see useOperations) without a form to show its error in: an error is shown in the snackbar.
// After a successful change React Router reloads the page data; after an error it is reloaded too (React Router doesn't reload after a
// failed action), e.g. the grid shows the stored state again, like the done checkbox of a todo.
export function useMutate() {
    const showError = useShowError();
    const { revalidate } = useRevalidator();
    return useCallback(
        async (mutation: Promise<unknown>, fallbackMessage?: string) => {
            try {
                await mutation;
            } catch (error) {
                // a ValidationError's message, otherwise the fallback
                showError(errorMessage(error, fallbackMessage));
                await revalidate();
            }
        },
        [showError, revalidate],
    );
}
