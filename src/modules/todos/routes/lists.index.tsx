import { href, replace } from "react-router";

import { loadOperation } from "~/routeOperations.server";

import { todoOperations } from "../operations.server";
import type { Route } from "./+types/lists.index";

// The user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export async function loader({ context }: Route.LoaderArgs) {
    const { id } = await loadOperation(todoOperations.getDefaultList, context, {});
    throw replace(href("/lists/:listId", { listId: id }));
}
