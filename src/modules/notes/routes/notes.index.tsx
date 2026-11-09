import { href, replace } from "react-router";

import { userContext } from "~/context";
import { clientIntentAction, intentAction } from "~/intents";

import { getNotebookRepository } from "../db/notebooks.server";
import { notebooksIntents } from "../intents.server";
import type { Route } from "./+types/notes.index";

// The user's first notebook (created if the user has none yet)
export async function loader({ context }: Route.LoaderArgs) {
    const { id } = await getNotebookRepository().getOrCreateDefault(context.get(userContext).id);
    throw replace(href("/notes/:notebookId", { notebookId: id }));
}

// creates a notebook (the sidebar, components/NotebooksNavigation.tsx)
export const action = intentAction(notebooksIntents);
export const clientAction = clientIntentAction;
