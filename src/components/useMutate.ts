import { useCallback } from "react";
import { useRevalidator } from "react-router";

import { errorMessage } from "~/errors";

import { useShowError } from "./ErrorSnackbar";

// Runs a change (e.g. an API request) without a form to show its error in: an error is shown in the snackbar. The page data is
// reloaded afterwards, also after an error (e.g. the grid shows the stored state again, like the done checkbox of a todo).
export function useMutate() {
    const { revalidate } = useRevalidator();
    const showError = useShowError();
    return useCallback(
        async (mutation: Promise<unknown>, fallbackMessage?: string) => {
            try {
                await mutation;
            } catch (error) {
                // a ValidationError's message, otherwise the fallback
                showError(errorMessage(error, fallbackMessage));
            }
            await revalidate();
        },
        [revalidate, showError],
    );
}
