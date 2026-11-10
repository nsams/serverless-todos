import { createServerFn } from "@tanstack/react-start";

import { operationHandler } from "~/operationHandler";
import { operationInput } from "~/operations";

import { todoOperations } from "./operations.server";

// Server functions of the todos: thin adapters over the module's operations (operations.server.ts), see lists.functions.ts

// The todos of a list for its grid (one page, sorted and filtered as in the URL)
export const listTodos = createServerFn()
    .validator(operationInput<typeof todoOperations.listTodos>)
    .handler(operationHandler(todoOperations.listTodos));

export const createTodo = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.createTodo>)
    .handler(operationHandler(todoOperations.createTodo));

export const updateTodo = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.updateTodo>)
    .handler(operationHandler(todoOperations.updateTodo));

export const deleteTodo = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.deleteTodo>)
    .handler(operationHandler(todoOperations.deleteTodo));
