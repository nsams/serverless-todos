import { createApi, operationRoute } from "~/api/hono.server";

import { noteOperations } from "./operations.server";

// The module's REST API (notebooks and notes), mounted at /api/notes (src/api/api.server.ts): every route runs one of the module's
// operations (operations.server.ts), which validate the input and do the checks. The app calls it with the module's typed client (api.ts).
export const notesApi = createApi()
    // the module's navigation data (sidebar)
    .on(...operationRoute("GET", "/notebooks", noteOperations.listNotebooks))
    // POST: creates the notebook if the user has none yet
    .on(...operationRoute("POST", "/notebooks/default", noteOperations.getDefaultNotebook))
    .on(...operationRoute("POST", "/notebooks", noteOperations.createNotebook))
    .on(...operationRoute("PATCH", "/notebooks/:notebookId", noteOperations.renameNotebook))
    .on(...operationRoute("DELETE", "/notebooks/:notebookId", noteOperations.deleteNotebook))
    // a page of a notebook's grid, the query is the grid state and the search text in the page's URL (noteSearch.ts)
    .on(...operationRoute("GET", "/notebooks/:notebookId/notes", noteOperations.listNotes))
    .on(...operationRoute("POST", "/notebooks/:notebookId/notes", noteOperations.createNote))
    .on(...operationRoute("GET", "/notes/:id", noteOperations.getNote))
    .on(...operationRoute("PATCH", "/notes/:id", noteOperations.updateNote))
    .on(...operationRoute("DELETE", "/notes/:id", noteOperations.deleteNote));
