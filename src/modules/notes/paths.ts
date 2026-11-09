// The paths of the module's pages (routes.ts). They are also the route ids: the chat assistant gets the id of the page shown
// (src/chat/chat.ts) and the module tells it what the user is looking at (module.server.ts).

// redirects to the user's first notebook (created if the user has none yet)
export const notebooksPath = "/notes";
// the notes of a notebook in a grid
export const notebookPath = "/notes/:notebookId";
// a note in the editor
export const notePath = "/notes/:notebookId/:noteId";
