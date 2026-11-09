import { useRouteLoaderData } from "react-router";

import { appRouteId } from "~/client/routeIds";

// The navigation data of a module (the result of its navigation loader, see AppModule), available on every page of the app layout
export function useNavigationData(moduleId: string): unknown {
    const data = useRouteLoaderData(appRouteId) as { navigation: Record<string, unknown> } | undefined;
    return data?.navigation[moduleId];
}
