import { createApi, operationRoute } from "~/api/hono.server";

import { todoDrafts, todoOperations } from "./operations.server";

// The module's REST API (lists and todos), mounted at /api/todos (src/api/api.server.ts): every route runs one of the module's operations
// (operations.server.ts), which validate the input and do the checks. The app calls it with the module's typed client (api.ts).
export const todosApi = createApi()
    // the module's navigation data (sidebar)
    .on(...operationRoute("GET", "/lists", todoOperations.listLists))
    // POST: creates the list if the user has none yet
    .on(...operationRoute("POST", "/lists/default", todoOperations.getDefaultList))
    .on(...operationRoute("POST", "/lists", todoOperations.createList))
    .on(...operationRoute("PATCH", "/lists/:listId", todoOperations.renameList))
    .on(...operationRoute("DELETE", "/lists/:listId", todoOperations.deleteList))
    // a page of a list's grid, the query is the grid state in the page's URL (src/gridSearch.ts)
    .on(...operationRoute("GET", "/lists/:listId/todos", todoOperations.listTodos))
    .on(...operationRoute("POST", "/lists/:listId/todos", todoOperations.createTodo))
    .on(...operationRoute("GET", "/todos/:id", todoOperations.getTodo))
    .on(...operationRoute("PATCH", "/todos/:id", todoOperations.saveTodo))
    .on(...operationRoute("POST", "/todos/:id/publish", todoOperations.publishTodo))
    .on(...operationRoute("DELETE", "/todos/:id", todoOperations.deleteTodo))
    // The WebSocket of the todo's form to the todo's draft (live editing, todoDraft.ts)
    .get("/todos/:id/draft", (c) => todoDrafts.connect(c));
