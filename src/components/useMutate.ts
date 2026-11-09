import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import { useShowError } from "./ErrorSnackbar";

// Runs a change (e.g. a server function) without a form to show its error in: an error is shown in the snackbar. The page data is
// reloaded afterwards, also after an error (e.g. the grid shows the stored state again, like the done checkbox of a todo).
export function useMutate() {
    const router = useRouter();
    const showError = useShowError();
    return useCallback(
        async (mutation: Promise<unknown>, errorMessage = "Saving failed, please try again.") => {
            try {
                await mutation;
            } catch (error) {
                console.error(error);
                showError(errorMessage);
            }
            await router.invalidate();
        },
        [router, showError],
    );
}
