import { useCallback } from "react";

import { useShowError } from "./ErrorSnackbar";

// Runs a change (e.g. an intent submitted with useIntents) without a form to show its error in: an error is shown in the snackbar.
// The page data is reloaded by React Router after every action, also after an error (e.g. the grid shows the stored state again,
// like the done checkbox of a todo).
export function useMutate() {
    const showError = useShowError();
    return useCallback(
        async (mutation: Promise<unknown>, errorMessage = "Saving failed, please try again.") => {
            try {
                await mutation;
            } catch (error) {
                console.error(error);
                showError(errorMessage);
            }
        },
        [showError],
    );
}
