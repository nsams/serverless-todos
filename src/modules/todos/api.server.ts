import { mutation, query, router } from "~/api/trpc.server";

import { todoOperations } from "./operations.server";

// The module's API for its pages (api.ts: todosApi.*): the operations the UI uses (src/operations.ts), mounted under the module's id.
// findTodos is for the AI assistants only.
export const todosRouter = router({
    listLists: query(todoOperations.listLists),
    getDefaultList: mutation(todoOperations.getDefaultList),
    createList: mutation(todoOperations.createList),
    renameList: mutation(todoOperations.renameList),
    deleteList: mutation(todoOperations.deleteList),
    listTodos: query(todoOperations.listTodos),
    createTodo: mutation(todoOperations.createTodo),
    updateTodo: mutation(todoOperations.updateTodo),
    deleteTodo: mutation(todoOperations.deleteTodo),
});

export type TodosRouter = typeof todosRouter;
