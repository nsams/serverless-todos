import type { z } from "zod";

import { ValidationError } from "./errors";
import type { AppTool } from "./modules/types";

// An operation is a domain operation of a module (e.g. create a todo), defined once and used by
// - the UI: the API layer of the app wraps it (here: a TanStack Start server function, see e.g. src/modules/todos/todos.functions.ts),
// - the AI assistants: operations with AI metadata are the tools of the chat assistant and the MCP server (toolsFromOperations).
// So there is one input schema, one existence check and one error semantics per operation. Independent of the API layer and the
// AI framework: an operation is plain data plus a handler, it doesn't import anything stack-specific.

// Who calls the operation: the authenticated user (never chosen by the client or the model)
export type OperationContext = { userId: string };

// read: doesn't change data; write: creates or changes data; delete: deletes data (the AI assistants ask the user to confirm)
export type OperationEffect = "read" | "write" | "delete";

export type Operation<Input extends z.ZodType = z.ZodType, Output = unknown> = {
    // validates untrusted input (from the UI, the model, an MCP client); the descriptions (.describe()) are shown to the model
    input: Input;
    effect: OperationEffect;
    // for the AI assistants: an operation with AI metadata is a tool (named like the operation's key in the module's operations),
    // one without is only used by the UI (e.g. a grid's page of rows)
    ai?: {
        // short human-readable name (shown by MCP clients)
        title: string;
        description: string;
    };
    // The whole business logic, incl. existence and ownership checks. Throws NotFoundError or ValidationError (src/errors.ts).
    // A method (not a function property), so specific operations are assignable to Operation<z.ZodType>.
    handler(ctx: OperationContext, input: z.output<Input>): Promise<Output>;
};

// The operations of a module by name; the names of operations with AI metadata are the tool names
export type Operations = Record<string, Operation>;

// Infers the handler's input type from the input schema
export function defineOperation<Input extends z.ZodType, Output>(operation: Operation<Input, Output>) {
    return operation;
}

// The input an operation accepts (before parsing), e.g. the data of a server function
export type OperationInput<Op extends Operation> = z.input<Op["input"]>;

export type OperationOutput<Op extends Operation> = Awaited<ReturnType<Op["handler"]>>;

// Validates untrusted input with the operation's schema; invalid input throws a ValidationError with the messages of the schema
// (e.g. "Name is required", see the operations' schemas)
export function parseOperationInput<Input extends z.ZodType>(operation: Operation<Input, unknown>, input: unknown): z.output<Input> {
    const result = operation.input.safeParse(input);
    if (!result.success) {
        throw new ValidationError(result.error.issues.map((issue) => issue.message).join("; "));
    }
    return result.data;
}

// Runs an operation with untrusted input: what every API layer and the AI tools call
export async function runOperation<Input extends z.ZodType, Output>(
    operation: Operation<Input, Output>,
    ctx: OperationContext,
    input: unknown,
): Promise<Output> {
    return operation.handler(ctx, parseOperationInput(operation, input));
}

// Types the input of an API adapter by the operation without validating it (runOperation validates it), e.g. a server function's
// validator: `.validator(operationInput<typeof todoOperations.createTodo>)`. Only refers to the operation's type, so client code that
// imports the adapter doesn't import the operation (server code).
export function operationInput<Op extends Operation>(input: OperationInput<Op>): OperationInput<Op> {
    return input;
}

// The tools for the AI assistants (chat assistant, MCP server): the operations with AI metadata, named like the operations, scoped to the user.
// module: the id of the module the operations belong to (the chat tells the client which modules' data changed).
export function toolsFromOperations(module: string, operations: Operations, ctx: OperationContext): Record<string, AppTool> {
    const tools: Record<string, AppTool> = {};
    for (const [name, operation] of Object.entries(operations)) {
        if (operation.ai) {
            tools[name] = {
                module,
                title: operation.ai.title,
                description: operation.ai.description,
                inputSchema: operation.input,
                effect: operation.effect,
                execute: async (input) => toJson(await runOperation(operation, ctx, input)),
            };
        }
    }
    return tools;
}

// The model gets JSON, e.g. dates as ISO strings
function toJson(value: unknown): unknown {
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
}
