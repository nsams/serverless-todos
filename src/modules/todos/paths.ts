// The paths of the module's pages (pages.tsx). They also identify the pages for the chat assistant: it gets the path pattern of the page shown
// (src/chat/chat.ts) and the module tells it what the user is looking at (module.server.ts).

// redirects to the user's first list (created if the user has none yet)
export const listsPath = "/lists";
// the todos of a list
export const listPath = "/lists/:listId";
