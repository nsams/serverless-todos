import { href, replace } from "react-router";

import { loadOperation } from "~/routeOperations.server";

import { noteOperations } from "../operations.server";
import type { Route } from "./+types/notes.index";

// The user's first notebook (created if the user has none yet)
export async function loader({ context }: Route.LoaderArgs) {
    const { id } = await loadOperation(noteOperations.getDefaultNotebook, context, {});
    throw replace(href("/notes/:notebookId", { notebookId: id }));
}
