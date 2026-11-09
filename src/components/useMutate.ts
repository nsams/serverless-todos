import { useCallback } from "react";
import { useRevalidator } from "react-router";

import { useShowError } from "./ErrorSnackbar";

// Runs a change (e.g. an API request) without a form to show its error in: an error is shown in the snackbar. The page data is
// reloaded afterwards, also after an error (e.g. the grid shows the stored state again, like the done checkbox of a todo).
export function useMutate() {
    const { revalidate } = useRevalidator();
    const showError = useShowError();
    return useCallback(
        async (mutation: Promise<unknown>, errorMessage = "Saving failed, please try again.") => {
            try {
                await mutation;
            } catch (error) {
                console.error(error);
                showError(errorMessage);
            }
            await revalidate();
        },
        [revalidate, showError],
    );
}
