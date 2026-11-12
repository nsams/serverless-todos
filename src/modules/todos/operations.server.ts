import { z } from "zod";

import { dateStringSchema } from "~/dates";
import { NotFoundError } from "~/errors";
import { defineOperation, inputValidationError, type Operations } from "~/operations";

import { getListRepository, type List } from "./db/lists.server";
import { getTodoRepository, type Todo } from "./db/todos.server";
import { draftValues, type TodoDraftValues } from "./draft/draft";
import { getTodoDraft, type TodoDraftState } from "./draft/draftAgent.server";
import { maxListNameLength, maxTodoDescriptionLength, maxTodoTitleLength } from "./limits";
import { parseTodoSearch, todoSearchSchema } from "./todoSearch";

// The operations of the todos module (src/operations.ts): used by the UI (the routes of the REST API in api.server.ts)
// and, the ones with AI metadata, as tools of the chat assistant and the MCP server. Every operation is scoped to the user (ctx.userId).

const maxSearchResults = 50;

// The messages are shown in the forms and reported to the model
const listNameSchema = z.string().trim().min(1, "Name is required").max(maxListNameLength);
const titleSchema = z.string().trim().min(1, "Title is required").max(maxTodoTitleLength);
const descriptionSchema = z.string().trim().max(maxTodoDescriptionLength);
const dueDateSchema = dateStringSchema.nullable().describe("Due date as YYYY-MM-DD, null for no due date");

// What the UI and the model get to see of a list and a todo (not the user id)
function listView({ id, name }: List) {
    return { id, name };
}

function todoView({ id, listId, title, description, dueDate, done, createdAt }: Todo) {
    return { id, listId, title, description, dueDate, done, createdAt };
}

export type TodoView = ReturnType<typeof todoView>;

async function getList(userId: string, listId: string) {
    const list = await getListRepository().get(userId, listId);
    if (!list) {
        throw new NotFoundError(`List ${listId} not found`);
    }
    return list;
}

async function getTodo(userId: string, id: string) {
    const todo = await getTodoRepository().get(userId, id);
    if (!todo) {
        throw new NotFoundError(`Todo ${id} not found`);
    }
    return todo;
}

// The changes of a todo's fields (omitted: unchanged), validated like all input: the input of saveTodo and updateTodo, and the draft's
// changes when it is published
const todoChangesSchema = z.object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    dueDate: dueDateSchema.optional(),
    done: z.boolean().optional(),
    listId: z.string().optional().describe("Moves the todo to this list"),
});

type TodoChanges = z.output<typeof todoChangesSchema>;

// Saves changes of a todo to the database. Its draft (live editing in the form, draft/) takes them over: the fields the draft doesn't
// change follow the stored todo. publishedDraft: the draft whose changes are saved (publishTodo).
async function saveTodoChanges(userId: string, id: string, changes: TodoChanges, publishedDraft?: TodoDraftValues) {
    if (changes.listId !== undefined) {
        // tells a missing target list from a missing todo
        await getList(userId, changes.listId);
    }
    const todo = await getTodoRepository().update(userId, id, changes);
    if (!todo) {
        throw new NotFoundError(`Todo ${id} not found`);
    }
    await (await getTodoDraft(id)).todoStored(draftValues(todo), publishedDraft);
    return todo;
}

// What the UI and the model get to see of a todo's draft
function draftView(id: string, { draft, changedFields }: TodoDraftState) {
    return { draft: { id, ...draft }, unpublishedChanges: changedFields };
}

export const todoOperations = {
    listLists: defineOperation({
        input: z.object({}),
        effect: "read",
        ai: { title: "List todo lists", description: "Lists all todo lists of the user with their number of open todos." },
        // also the module's navigation data (sidebar)
        handler: async ({ userId }) => (await getListRepository().list(userId)).map(({ id, name, openCount }) => ({ id, name, openCount })),
    }),
    // The list shown on /lists, created if the user has none yet
    getDefaultList: defineOperation({
        input: z.object({}),
        effect: "write",
        handler: async ({ userId }) => listView(await getListRepository().getOrCreateDefault(userId)),
    }),
    createList: defineOperation({
        input: z.object({ name: listNameSchema }),
        effect: "write",
        ai: { title: "Create todo list", description: "Creates a new todo list." },
        handler: async ({ userId }, { name }) => listView(await getListRepository().create(userId, name)),
    }),
    renameList: defineOperation({
        input: z.object({ listId: z.string(), name: listNameSchema }),
        effect: "write",
        ai: { title: "Rename todo list", description: "Renames a todo list." },
        handler: async ({ userId }, { listId, name }) => {
            const list = await getListRepository().rename(userId, listId, name);
            if (!list) {
                throw new NotFoundError(`List ${listId} not found`);
            }
            return listView(list);
        },
    }),
    deleteList: defineOperation({
        input: z.object({ listId: z.string() }),
        effect: "delete",
        ai: { title: "Delete todo list", description: "Deletes a todo list including all its todos. The user is asked to confirm." },
        handler: async ({ userId }, { listId }) => {
            const list = await getListRepository().delete(userId, listId);
            if (!list) {
                throw new NotFoundError(`List ${listId} not found`);
            }
            return { deleted: listView(list) };
        },
    }),
    // The todos of a list for its grid (one page, sorted and filtered as in the URL)
    listTodos: defineOperation({
        input: todoSearchSchema.extend({ listId: z.string() }),
        effect: "read",
        handler: async ({ userId }, { listId, ...search }) => {
            const list = await getList(userId, listId);
            const { page, pageSize, sort, filter } = parseTodoSearch(search);
            const { rows, totalCount } = await getTodoRepository().list(userId, listId, { offset: page * pageSize, limit: pageSize, sort, filter });
            return { list: listView(list), todos: rows.map(todoView), totalCount };
        },
    }),
    // A todo for its detail page
    getTodo: defineOperation({
        input: z.object({ id: z.string() }),
        effect: "read",
        handler: async ({ userId }, { id }) => todoView(await getTodo(userId, id)),
    }),
    findTodos: defineOperation({
        input: z.object({
            listId: z.string().optional().describe("Only todos of this list"),
            query: z.string().trim().optional().describe("Only todos whose title or description contains this text (case-insensitive)"),
            status: z.enum(["open", "done", "all"]).default("open"),
        }),
        effect: "read",
        ai: {
            title: "Find todos",
            description: `Finds todos, in all lists or in one list. Returns at most ${maxSearchResults} todos: open ones first, then by due date.`,
        },
        handler: async ({ userId }, { listId, query, status }) => {
            const rows = await getTodoRepository().search(userId, {
                listId,
                query: query || undefined,
                done: status === "all" ? undefined : status === "done",
                limit: maxSearchResults,
            });
            return rows.map(todoView);
        },
    }),
    createTodo: defineOperation({
        input: z.object({
            listId: z.string(),
            title: titleSchema,
            description: descriptionSchema.default(""),
            dueDate: dueDateSchema.default(null),
        }),
        effect: "write",
        ai: { title: "Create todo", description: "Creates a todo in a list." },
        handler: async ({ userId }, { listId, ...values }) => {
            const todo = await getTodoRepository().create(userId, listId, values);
            if (!todo) {
                throw new NotFoundError(`List ${listId} not found`);
            }
            return { created: todoView(todo) };
        },
    }),
    // Saves changes right away, not through the draft (e.g. the done checkbox of the list's grid); the draft takes them over
    saveTodo: defineOperation({
        input: todoChangesSchema.extend({ id: z.string() }),
        effect: "write",
        handler: async ({ userId }, { id, ...changes }) => ({ updated: todoView(await saveTodoChanges(userId, id, changes)) }),
    }),
    // The draft of a todo (draft/): edited live by everyone who has the todo's form open and by the AI assistants
    getTodoDraft: defineOperation({
        input: z.object({ id: z.string() }),
        effect: "read",
        ai: {
            title: "Get todo draft",
            description:
                "Gets the draft of a todo: the values that are being edited (in the app's form and with updateTodo) and the fields that differ from the todo as published (unpublishedChanges).",
        },
        handler: async ({ userId }, { id }) => {
            const todo = await getTodo(userId, id);
            return draftView(id, await (await getTodoDraft(id)).getDraft(draftValues(todo)));
        },
    }),
    updateTodo: defineOperation({
        input: todoChangesSchema.extend({ id: z.string() }),
        effect: "write",
        ai: {
            title: "Update todo draft",
            description:
                "Changes the draft of a todo: title, description, due date, done, or the list (moves it). Everyone editing the todo in the app sees the changes live; they are saved to the todo when the draft is published (publishTodo). Omitted fields stay unchanged.",
        },
        handler: async ({ userId }, { id, ...changes }) => {
            const todo = await getTodo(userId, id);
            if (changes.listId !== undefined) {
                await getList(userId, changes.listId);
            }
            return draftView(id, await (await getTodoDraft(id)).updateDraft(draftValues(todo), changes));
        },
    }),
    publishTodo: defineOperation({
        input: z.object({ id: z.string() }),
        effect: "write",
        ai: {
            title: "Publish todo draft",
            description:
                "Publishes the draft of a todo: saves its changes (made with updateTodo or in the app's form, by anyone) to the todo. Returns the saved todo and the published fields.",
        },
        handler: async ({ userId }, { id }) => {
            const todo = await getTodo(userId, id);
            const { draft, changedFields } = await (await getTodoDraft(id)).getDraft(draftValues(todo));
            // the draft's changes, validated like any input (e.g. an empty title typed into the form)
            const parsed = todoChangesSchema.safeParse(Object.fromEntries(changedFields.map((field) => [field, draft[field]])));
            if (!parsed.success) {
                throw inputValidationError(parsed.error.issues);
            }
            const published = changedFields.length > 0 ? await saveTodoChanges(userId, id, parsed.data, draft) : todo;
            return { published: todoView(published), publishedFields: changedFields };
        },
    }),
    deleteTodo: defineOperation({
        input: z.object({ id: z.string() }),
        effect: "delete",
        ai: { title: "Delete todo", description: "Deletes a todo. The user is asked to confirm." },
        handler: async ({ userId }, { id }) => {
            const todo = await getTodoRepository().delete(userId, id);
            if (!todo) {
                throw new NotFoundError(`Todo ${id} not found`);
            }
            // the forms editing it say so, its draft is gone
            await (await getTodoDraft(id)).todoDeleted();
            return { deleted: todoView(todo) };
        },
    }),
} satisfies Operations;

// Guidance for the model on how to use the tools (system prompt of the chat assistant, instructions of the MCP server)
export const todoInstructions = [
    "Todo lists and todos: the tools manage the user's todo lists and todos.",
    'Due dates are calendar dates (YYYY-MM-DD). Resolve relative dates like "tomorrow" or "next Friday" from the user\'s current date.',
    "To change or delete a todo, find it first. If several todos match, ask which one is meant.",
    "Changes to a todo (updateTodo) go into its draft, which everyone editing the todo in the app sees live; they are saved when the draft is published (publishTodo). Publish after changing a todo, unless the user wants to review the changes in the app first. Publishing also saves changes others made to the draft in the app: check them with getTodoDraft if unsure.",
    "Don't show ids to the user.",
];
