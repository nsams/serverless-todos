import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router";

import { PageLoading } from "~/client/errors";

type Props = {
    // returns the path of the default item, e.g. of the user's first list (created by the API if the user has none yet)
    load: () => Promise<string>;
};

// A page that redirects to a default item of a module, e.g. /lists to the user's first list
export function DefaultRedirect({ load }: Props) {
    const { pathname } = useLocation();
    const { data: path, isFetchedAfterMount } = useQuery({
        // not one of the module's query keys: invalidating them (e.g. after deleting the list and navigating here) doesn't load it twice
        queryKey: ["defaultRedirect", pathname],
        queryFn: load,
        // always asked anew (e.g. after deleting the list redirected to before): not kept in the cache once left, and a cached
        // result isn't used (it could be outdated)
        gcTime: 0,
    });
    if (path === undefined || !isFetchedAfterMount) {
        return <PageLoading />;
    }
    return <Navigate to={path} replace />;
}
