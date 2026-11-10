import { defineNavigation } from "~/navigation";

import { notesApi } from "./api";
import { NotebooksNavigation } from "./components/NotebooksNavigation";
import { notesModuleId } from "./moduleId";

// The user's notebooks with their number of notes in the sidebar; useLoaderData: the notebooks for the pages (e.g. the "move to" menu)
export const notebooksNavigation = defineNavigation(notesModuleId, {
    title: "Notes",
    loader: () => notesApi.listNotebooks.query({}),
    Component: NotebooksNavigation,
});
