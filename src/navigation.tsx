import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

import { defineLoader } from "./routing";

// A module's section in the app's sidebar (AppModule.navigation), e.g. its lists: its data is loaded by a route of its own above the pages
// (src/router.tsx), so it is reloaded only after a change of its module (src/moduleData.ts), not on every navigation.
export type ModuleNavigation = {
    // heading of the module's section in the sidebar
    title: string;
    // the pathless route that loads the navigation data
    route: Pick<RouteObject, "id" | "loader">;
    // onNavigate: closes the sidebar on small screens
    Component: ComponentType<{ onNavigate: () => void }>;
};

// Component gets the data of the loader, typed by it. useLoaderData: the data for the module's pages (e.g. the "move to" menu).
export function defineNavigation<Data>(
    moduleId: string,
    {
        title,
        loader,
        Component,
    }: {
        title: string;
        loader: () => Promise<Data>;
        Component: ComponentType<{ data: Data; onNavigate: () => void }>;
    },
) {
    const { id, loader: routeLoader, useLoaderData } = defineLoader(`navigation:${moduleId}`, loader);

    function NavigationComponent({ onNavigate }: { onNavigate: () => void }) {
        return <Component data={useLoaderData()} onNavigate={onNavigate} />;
    }

    return { title, route: { id, loader: routeLoader }, Component: NavigationComponent, useLoaderData };
}
