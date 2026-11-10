import { useCallback } from "react";
import { type NavigateOptions, type RouteObject, type ShouldRevalidateFunction, useNavigate, useRevalidator } from "react-router";

// Reloading the modules' data after a change: the route loaders of the changed modules run again, the others keep their data (e.g. a change
// of a todo doesn't reload the notebooks in the sidebar). Every route of a module (its pages and its navigation, src/router.tsx) gets
// moduleShouldRevalidate; a change (in the UI: useRevalidateModule, useMutate, useNavigateAfterChange; by the assistant:
// src/components/ChatPanel.tsx) marks its module while the loaders run again.

// module id → number of reloads running for it: counted, so a reload that ends doesn't unmark a module another one (e.g. after a change
// by the assistant during a change in the UI) still reloads
const changedModules = new Map<string, number>();

async function whileChanged(moduleIds: string[], load: () => Promise<void>) {
    for (const moduleId of moduleIds) {
        changedModules.set(moduleId, (changedModules.get(moduleId) ?? 0) + 1);
    }
    try {
        await load();
    } finally {
        for (const moduleId of moduleIds) {
            const count = (changedModules.get(moduleId) ?? 1) - 1;
            if (count > 0) {
                changedModules.set(moduleId, count);
            } else {
                changedModules.delete(moduleId);
            }
        }
    }
}

// Runs the loaders of the modules' routes again (the routes shown)
export function useRevalidateModules() {
    const { revalidate } = useRevalidator();
    return useCallback((moduleIds: string[]) => whileChanged(moduleIds, revalidate), [revalidate]);
}

export function useRevalidateModule(moduleId: string) {
    const revalidateModules = useRevalidateModules();
    return useCallback(() => revalidateModules([moduleId]), [revalidateModules, moduleId]);
}

// Navigates after a change of the module (e.g. to the list just created, or away from the one just deleted): the navigation also reloads
// the module's data that stays on screen (e.g. the sidebar), with the new page's data in one request
export function useNavigateAfterChange(moduleId: string) {
    const navigate = useNavigate();
    return useCallback(
        (to: string, options?: NavigateOptions) =>
            whileChanged([moduleId], async () => {
                await navigate(to, options);
            }),
        [navigate, moduleId],
    );
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
