import { defineNavigation } from "~/navigation";

import { todosApi } from "./api";
import { ListsNavigation } from "./components/ListsNavigation";
import { todosModuleId } from "./moduleId";

// The user's lists with their number of open todos in the sidebar; useLoaderData: the lists for the pages (e.g. the "move to" menu)
export const listsNavigation = defineNavigation(todosModuleId, {
    title: "Todo lists",
    loader: ({ signal }) => todosApi.listLists.query({}, { signal }),
    Component: ListsNavigation,
});
