// Errors of the operations (src/operations.ts), independent of the API layer. Each API layer maps them once
// (e.g. NotFoundError → 404, ValidationError → 422 with the message shown in the form); the AI tools report the message to the model.
// Shared by the server and the client (the client shows the message of a ValidationError).

// The entity doesn't exist or belongs to another user (deliberately not distinguished)
export class NotFoundError extends Error {
    override name = "NotFoundError";
}

// Invalid input, e.g. an empty name. The message is meant for the user (shown in the form) and for the model.
export class ValidationError extends Error {
    override name = "ValidationError";
}

// The message of an error to show to the user: the message of a ValidationError, otherwise the fallback (other errors may contain
// internals). Other errors are unexpected: they are logged.
export function errorMessage(error: unknown, fallback = "Saving failed, please try again.") {
    if (error instanceof ValidationError) {
        return error.message;
    }
    console.error(error);
    return fallback;
}
