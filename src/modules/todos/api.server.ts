import { createApi, operationRoute } from "~/api/hono.server";
import { runOperation } from "~/operations";

import { draftValues } from "./draft/draft";
import { draftUserHeader, getTodoDraft } from "./draft/draftAgent.server";
import { todoOperations } from "./operations.server";

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
    // The WebSocket of the todo's form to the todo's draft (live editing, draft/): forwarded to the draft's Durable Object once the
    // todo is found to be the user's (404 otherwise), with the user for the others' cursors
    .get("/todos/:id/draft", async (c) => {
        if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
            return c.text("Expected a WebSocket upgrade", 426);
        }
        const todo = await runOperation(todoOperations.getTodo, { userId: c.var.user.id }, { id: c.req.param("id") });
        const draft = await getTodoDraft(todo.id);
        // takes over changes of the stored todo the draft may have missed
        await draft.openDraft(draftValues(todo));
        const headers = new Headers(c.req.raw.headers);
        headers.set(draftUserHeader, c.var.user.email);
        return draft.fetch(new Request(c.req.raw, { headers }));
    });
