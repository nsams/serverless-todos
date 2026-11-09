import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

// Reloads the data of the page shown after a change: the page's data, the navigation data in the sidebar (e.g. the number of
// open todos) and the user. All cached data is marked as stale, then the loaders of the current routes run again: they refetch
// their data (fetchQuery) and can redirect (e.g. an empty grid page) or show "not found" (e.g. a note deleted by the assistant).
// Data of other pages is refetched when they are opened.
export function useRevalidate() {
    const router = useRouter();
    const queryClient = useQueryClient();
    return useCallback(async () => {
        await queryClient.invalidateQueries({ refetchType: "none" });
        await router.invalidate();
    }, [router, queryClient]);
}
