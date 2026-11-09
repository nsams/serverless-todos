import { useCallback } from "react";

import { useShowError } from "./ErrorSnackbar";

// Runs a change (e.g. an API mutation) without a form to show its error in: an error is shown in the snackbar. The affected data is
// reloaded afterwards (invalidate, e.g. invalidateTodos), also after an error (e.g. the grid shows the stored state again, like the
// done checkbox of a todo).
export function useMutate(invalidate: () => Promise<unknown>) {
    const showError = useShowError();
    return useCallback(
        async (mutation: Promise<unknown>, errorMessage = "Saving failed, please try again.") => {
            try {
                await mutation;
            } catch (error) {
                console.error(error);
                showError(errorMessage);
            }
            await invalidate();
        },
        [invalidate, showError],
    );
}
