import { href, replace } from "react-router";

import { userContext } from "~/context";
import { clientIntentAction, intentAction } from "~/intents";

import { getListRepository } from "../db/lists.server";
import { listsIntents } from "../intents.server";
import type { Route } from "./+types/lists.index";

// The user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export async function loader({ context }: Route.LoaderArgs) {
    const { id } = await getListRepository().getOrCreateDefault(context.get(userContext).id);
    throw replace(href("/lists/:listId", { listId: id }));
}

// creates a list (the sidebar, components/ListsNavigation.tsx)
export const action = intentAction(listsIntents);
export const clientAction = clientIntentAction;
