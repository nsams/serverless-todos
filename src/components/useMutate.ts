import { useCallback } from "react";

import { useInvalidateModule } from "~/client/queries";
import { errorMessage } from "~/errors";

import { useShowError } from "./ErrorSnackbar";

// Runs a change (e.g. a request of the module's API) without a form to show its error in: an error is shown in the snackbar. The module's data
// is reloaded afterwards, also after an error (e.g. the grid shows the stored state again, like the done checkbox of a todo).
export function useMutate(moduleId: string) {
    const invalidate = useInvalidateModule(moduleId);
    const showError = useShowError();
    return useCallback(
        async (mutation: Promise<unknown>, fallbackMessage?: string) => {
            try {
                await mutation;
            } catch (error) {
                // a ValidationError's message, otherwise the fallback
                showError(errorMessage(error, fallbackMessage));
            }
            await invalidate();
        },
        [invalidate, showError],
    );
}
