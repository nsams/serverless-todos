import { useCallback } from "react";
import { type RouteObject, type ShouldRevalidateFunction, useRevalidator } from "react-router";

// Reloading the modules' data after a change: the route loaders of the changed modules run again, the others keep their data (e.g. a change
// of a todo doesn't reload the notebooks in the sidebar). Every route of a module (its pages and its navigation, src/router.tsx) gets
// moduleShouldRevalidate; a change (in the UI: useRevalidateModule, useMutate; by the assistant: src/components/ChatPanel.tsx) marks
// its module while the loaders run again.

const changedModules = new Set<string>();

// Runs the loaders of the modules' routes again (the routes shown)
export function useRevalidateModules() {
    const { revalidate } = useRevalidator();
    return useCallback(
        async (moduleIds: string[]) => {
            for (const moduleId of moduleIds) {
                changedModules.add(moduleId);
            }
            try {
                await revalidate();
            } finally {
                for (const moduleId of moduleIds) {
                    changedModules.delete(moduleId);
                }
            }
        },
        [revalidate],
    );
}

export function useRevalidateModule(moduleId: string) {
    const revalidateModules = useRevalidateModules();
    return useCallback(() => revalidateModules([moduleId]), [revalidateModules, moduleId]);
}

// reloadOnNavigation: whether the route's loader also runs again when the URL changes (as React Router decides, e.g. other search params
// of a page); false for data that only changes with the module's data (the sidebar)
export function moduleShouldRevalidate(moduleId: string, reloadOnNavigation: boolean): ShouldRevalidateFunction {
    return ({ currentUrl, nextUrl, defaultShouldRevalidate }) =>
        changedModules.has(moduleId) || (currentUrl.href !== nextUrl.href && reloadOnNavigation && defaultShouldRevalidate);
}

// A module's pages with moduleShouldRevalidate
export function moduleRoutes(moduleId: string, routes: RouteObject[]): RouteObject[] {
    const shouldRevalidate = moduleShouldRevalidate(moduleId, true);
    return routes.map((route) =>
        route.index
            ? { ...route, shouldRevalidate }
            : { ...route, shouldRevalidate, children: route.children && moduleRoutes(moduleId, route.children) },
    );
}
