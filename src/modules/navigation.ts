import { getRouteApi } from "@tanstack/react-router";

const appRoute = getRouteApi("/_app");

// The navigation data of a module (the result of its navigation loader, see AppModule), available on every page of the app layout
export function useNavigationData(moduleId: string): unknown {
    return appRoute.useLoaderData({ select: ({ navigation }) => navigation[moduleId] });
}
