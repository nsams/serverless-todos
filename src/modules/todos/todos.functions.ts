import { createServerFn } from "@tanstack/react-start";

import { operationInput, runOperation } from "~/operations";

import { todoOperations } from "./operations.server";

// Server functions of the todos: thin adapters over the module's operations (operations.server.ts), see lists.functions.ts

// The todos of a list for its grid (one page, sorted and filtered as in the URL)
export const listTodos = createServerFn()
    .validator(operationInput<typeof todoOperations.listTodos>)
    .handler(({ data, context }) => runOperation(todoOperations.listTodos, { userId: context.user.id }, data));

export const createTodo = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.createTodo>)
    .handler(({ data, context }) => runOperation(todoOperations.createTodo, { userId: context.user.id }, data));

export const updateTodo = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.updateTodo>)
    .handler(({ data, context }) => runOperation(todoOperations.updateTodo, { userId: context.user.id }, data));

export const deleteTodo = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.deleteTodo>)
    .handler(({ data, context }) => runOperation(todoOperations.deleteTodo, { userId: context.user.id }, data));
