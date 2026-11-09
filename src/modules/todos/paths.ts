// The paths of the module's pages (routes.ts). They are also the route ids: the chat assistant gets the id of the page shown
// (src/chat/chat.ts) and the module tells it what the user is looking at (module.server.ts).

// redirects to the user's first list (created if the user has none yet)
export const listsPath = "/lists";
// the todos of a list
export const listPath = "/lists/:listId";
