import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useShowError } from "./ErrorSnackbar";

// Runs a change (e.g. an API request) without a form to show its error in: an error is shown in the snackbar. The queries of
// queryKey (e.g. the module's: ["todos"], the list's todos and the sidebar's open counts; a constant) are reloaded afterwards,
// also after an error (e.g. the grid shows the stored state again, like the done checkbox of a todo).
export function useMutate(queryKey: QueryKey) {
    const queryClient = useQueryClient();
    const showError = useShowError();
    return useCallback(
        async (mutation: Promise<unknown>, errorMessage = "Saving failed, please try again.") => {
            try {
                await mutation;
            } catch (error) {
                console.error(error);
                showError(errorMessage);
            }
            await queryClient.invalidateQueries({ queryKey });
        },
        [queryClient, showError, queryKey],
    );
}
