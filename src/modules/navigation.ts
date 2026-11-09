import { useRouteLoaderData } from "react-router";

import type { loader } from "~/routes/_app";

// The navigation data of a module (the result of its ServerModule.loadNavigation), available on every page of the app layout
export function useNavigationData(moduleId: string): unknown {
    // the app layout's route id (src/routes.ts)
    return useRouteLoaderData<typeof loader>("app")?.navigation[moduleId];
}
