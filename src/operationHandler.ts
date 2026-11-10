import type { z } from "zod";

import { type Operation, runOperation } from "./operations";
import type { User } from "./user";

// The handler of a server function that wraps an operation (src/operations.ts): runs it for the authenticated user (context.user,
// src/start.ts), validating the input. The server function stays a static top-level declaration (needed by Start's compiler):
//
//     export const createTodo = createServerFn({ method: "POST" })
//         .validator(operationInput<typeof todoOperations.createTodo>)
//         .handler(operationHandler(todoOperations.createTodo));
export function operationHandler<Input extends z.ZodType, Output>(operation: Operation<Input, Output>) {
    // data: undefined for a server function without input (e.g. listLists), the operation's input is an empty object then
    return ({ data, context }: { data: unknown; context: { user: User } }) => runOperation(operation, { userId: context.user.id }, data ?? {});
}
