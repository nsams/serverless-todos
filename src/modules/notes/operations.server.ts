import { z } from "zod";

import { NotFoundError, ValidationError } from "~/errors";
import { defineOperation, type Operations } from "~/operations";

import { getNotebookRepository, type Notebook } from "./db/notebooks.server";
import { getNoteRepository, type Note } from "./db/notes.server";
import { maxNoteBodyLength, maxNotebookNameLength, maxNoteTitleLength } from "./limits";
import { noteSearchSchema, parseNoteSearch } from "./noteSearch";

// The operations of the notes module (src/operations.ts): used by the UI (the routes of the REST API in api.server.ts)
// and, the ones with AI metadata, as tools of the chat assistant and the MCP server. Every operation is scoped to the user (ctx.userId).

const maxSearchResults = 50;

// The messages are shown in the forms and reported to the model
const notebookNameSchema = z.string().trim().min(1, "Name is required").max(maxNotebookNameLength);
const titleSchema = z.string().trim().min(1, "Title is required").max(maxNoteTitleLength);
const bodySchema = z.string().max(maxNoteBodyLength).describe("Markdown");

// What the UI and the model get to see of a notebook and a note (not the user id)
function notebookView({ id, name }: Notebook) {
    return { id, name };
}

function noteView({ id, notebookId, title, body, createdAt, updatedAt }: Note) {
    return { id, notebookId, title, body, createdAt, updatedAt };
}

async function getNotebook(userId: string, notebookId: string) {
    const notebook = await getNotebookRepository().get(userId, notebookId);
    if (!notebook) {
        throw new NotFoundError(`Notebook ${notebookId} not found`);
    }
    return notebook;
}

async function getNote(userId: string, id: string) {
    const note = await getNoteRepository().get(userId, id);
    if (!note) {
        throw new NotFoundError(`Note ${id} not found`);
    }
    return note;
}

export const noteOperations = {
    listNotebooks: defineOperation({
        input: z.object({}),
        effect: "read",
        ai: { title: "List notebooks", description: "Lists all notebooks of the user with their number of notes." },
        // also the module's navigation data (sidebar)
        handler: async ({ userId }) => (await getNotebookRepository().list(userId)).map(({ id, name, noteCount }) => ({ id, name, noteCount })),
    }),
    // The notebook shown on /notes, created if the user has none yet
    getDefaultNotebook: defineOperation({
        input: z.object({}),
        effect: "write",
        handler: async ({ userId }) => notebookView(await getNotebookRepository().getOrCreateDefault(userId)),
    }),
    createNotebook: defineOperation({
        input: z.object({ name: notebookNameSchema }),
        effect: "write",
        ai: { title: "Create notebook", description: "Creates a new notebook." },
        handler: async ({ userId }, { name }) => notebookView(await getNotebookRepository().create(userId, name)),
    }),
    renameNotebook: defineOperation({
        input: z.object({ notebookId: z.string(), name: notebookNameSchema }),
        effect: "write",
        ai: { title: "Rename notebook", description: "Renames a notebook." },
        handler: async ({ userId }, { notebookId, name }) => {
            const notebook = await getNotebookRepository().rename(userId, notebookId, name);
            if (!notebook) {
                throw new NotFoundError(`Notebook ${notebookId} not found`);
            }
            return notebookView(notebook);
        },
    }),
    deleteNotebook: defineOperation({
        input: z.object({ notebookId: z.string() }),
        effect: "delete",
        ai: { title: "Delete notebook", description: "Deletes a notebook including all its notes. The user is asked to confirm." },
        handler: async ({ userId }, { notebookId }) => {
            const notebook = await getNotebookRepository().delete(userId, notebookId);
            if (!notebook) {
                throw new NotFoundError(`Notebook ${notebookId} not found`);
            }
            return { deleted: notebookView(notebook) };
        },
    }),
    // The notes of a notebook for its grid (one page, sorted and filtered as in the URL)
    listNotes: defineOperation({
        input: noteSearchSchema.extend({ notebookId: z.string() }),
        effect: "read",
        handler: async ({ userId }, { notebookId, ...search }) => {
            const notebook = await getNotebook(userId, notebookId);
            const { page, pageSize, sort, filter, query } = parseNoteSearch(search);
            const { rows, totalCount } = await getNoteRepository().list(userId, notebookId, {
                offset: page * pageSize,
                limit: pageSize,
                sort,
                filter,
                query,
            });
            return { notebook: notebookView(notebook), notes: rows, totalCount };
        },
    }),
    findNotes: defineOperation({
        input: z.object({
            notebookId: z.string().optional().describe("Only notes of this notebook"),
            query: z.string().trim().optional().describe("Only notes whose title or body contains this text (case-insensitive)"),
        }),
        effect: "read",
        ai: {
            title: "Find notes",
            description: `Finds notes, in all notebooks or in one notebook. Returns at most ${maxSearchResults} notes, most recently changed first, with the beginning of their body as excerpt: read a note with getNote for its full body.`,
        },
        handler: async ({ userId }, { notebookId, query }) => {
            const rows = await getNoteRepository().search(userId, { notebookId, query: query || undefined, limit: maxSearchResults });
            return rows.map(({ id, notebookId, title, excerpt, updatedAt }) => ({ id, notebookId, title, excerpt, updatedAt }));
        },
    }),
    getNote: defineOperation({
        input: z.object({ id: z.string() }),
        effect: "read",
        ai: { title: "Read note", description: "Returns a note with its full body (Markdown)." },
        handler: async ({ userId }, { id }) => noteView(await getNote(userId, id)),
    }),
    createNote: defineOperation({
        input: z.object({ notebookId: z.string(), title: titleSchema, body: bodySchema.default("") }),
        effect: "write",
        ai: { title: "Create note", description: "Creates a note in a notebook." },
        handler: async ({ userId }, { notebookId, ...values }) => {
            const note = await getNoteRepository().create(userId, notebookId, values);
            if (!note) {
                throw new NotFoundError(`Notebook ${notebookId} not found`);
            }
            return { created: noteView(note) };
        },
    }),
    updateNote: defineOperation({
        input: z.object({
            id: z.string(),
            title: titleSchema.optional(),
            body: bodySchema.optional().describe("The new body (Markdown), replaces the whole body"),
            notebookId: z.string().optional().describe("Moves the note to this notebook"),
        }),
        effect: "write",
        ai: {
            title: "Update note",
            description:
                "Updates a note: change its title, replace its whole body, or move it to another notebook. Omitted fields stay unchanged. To add text to the end of a note, use appendToNote instead.",
        },
        handler: async ({ userId }, { id, ...values }) => {
            if (values.notebookId !== undefined) {
                // tells a missing target notebook from a missing note
                await getNotebook(userId, values.notebookId);
            }
            const note = await getNoteRepository().update(userId, id, values);
            if (!note) {
                throw new NotFoundError(`Note ${id} not found`);
            }
            // the editor tells its own changes from changes made elsewhere (e.g. by the assistant) by updatedAt
            return { updated: noteView(note) };
        },
    }),
    appendToNote: defineOperation({
        input: z.object({ id: z.string(), text: z.string().trim().min(1).max(maxNoteBodyLength).describe("Markdown") }),
        effect: "write",
        ai: { title: "Append to note", description: "Adds text (Markdown) to the end of a note, as a new paragraph." },
        handler: async ({ userId }, { id, text }) => {
            const note = await getNote(userId, id);
            if (note.body.length + text.length + 2 > maxNoteBodyLength) {
                throw new ValidationError(`The note would get longer than ${maxNoteBodyLength} characters`);
            }
            const appended = await getNoteRepository().append(userId, id, text);
            if (!appended) {
                throw new NotFoundError(`Note ${id} not found`);
            }
            return { appended: { id, title: appended.title, text } };
        },
    }),
    deleteNote: defineOperation({
        input: z.object({ id: z.string() }),
        effect: "delete",
        ai: { title: "Delete note", description: "Deletes a note. The user is asked to confirm." },
        handler: async ({ userId }, { id }) => {
            const note = await getNoteRepository().delete(userId, id);
            if (!note) {
                throw new NotFoundError(`Note ${id} not found`);
            }
            return { deleted: { id: note.id, notebookId: note.notebookId, title: note.title } };
        },
    }),
} satisfies Operations;

// Guidance for the model on how to use the tools (system prompt of the chat assistant, instructions of the MCP server)
export const noteInstructions = [
    "Notebooks and notes: the tools manage the user's notebooks and the notes in them. Note bodies are Markdown.",
    "To answer questions about the content of notes (e.g. summarize them), find them first and read their full body with getNote.",
    "To add to a note, use appendToNote. Use updateNote with a body only to rewrite a note: read it first and keep what the user didn't ask to change.",
    "Notes and todos are separate: to turn a note into todos, read the note and create the todos with the todo tools.",
];
