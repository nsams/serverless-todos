import { parseResponse } from "hono/client";

import { defineNavigationData } from "~/client/routing";

import { todosClient } from "./api";
import { todosModuleId } from "./moduleId";

// The user's lists with their number of open todos: the navigation data of the module (sidebar), also used by the list page
export const listsNavigation = defineNavigationData(todosModuleId, () => parseResponse(todosClient.lists.$get()));

export const useLists = listsNavigation.useData;
