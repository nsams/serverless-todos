import { defineRoute } from "~/client/routing";

import { validateNoteSearch } from "./noteSearch";

// The module's pages (src/client/routing.ts): paths and search params, for the links (href) and the pages (pages/, see module.ts)

// The user's first notebook (created if the user has none yet)
export const notebooksRoute = defineRoute({ path: "/notes" });

// The notes of a notebook in a grid (pagination, sorting, filtering on the server, state and search text in the URL); a note opens
// in the editor, which keeps the grid state for its back link
export const notebookRoute = defineRoute({ path: "/notes/:notebookId", validateSearch: validateNoteSearch });

// A note in the editor. The search params are the state of the notebook's grid, kept for the back link.
export const noteRoute = defineRoute({ path: "/notes/:notebookId/:noteId", validateSearch: validateNoteSearch });
