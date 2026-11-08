import { z } from "zod";

import { type AppTool, defineTool } from "~/modules/types";

import { getNotebookRepository } from "./db/notebooks.server";
import { getNoteRepository, type Note } from "./db/notes.server";
import { maxNoteBodyLength, maxNotebookNameLength, maxNoteTitleLength } from "./limits";

// Tools that manage the user's notebooks and notes, for the chat assistant and the MCP server (see AppTool in src/modules/types.ts).
// Every tool is scoped to the authenticated user (userId is never chosen by the model).

const maxSearchResults = 50;

const titleSchema = z.string().trim().min(1).max(maxNoteTitleLength);
const bodySchema = z.string().max(maxNoteBodyLength).describe("Markdown");
const notebookNameSchema = z.string().trim().min(1).max(maxNotebookNameLength);

// What the model gets to see of a note
function toolNote({ id, notebookId, title, body, updatedAt }: Note) {
    return { id, notebookId, title, body, updatedAt: updatedAt.toISOString() };
}

export function createNoteTools(userId: string) {
    const notebooks = getNotebookRepository();
    const notes = getNoteRepository();

    const getNotebook = async (notebookId: string) => {
        const notebook = await notebooks.get(userId, notebookId);
        if (!notebook) {
            throw new Error(`Notebook ${notebookId} not found`);
        }
        return notebook;
    };
    const getNote = async (id: string) => {
        const note = await notes.get(userId, id);
        if (!note) {
            throw new Error(`Note ${id} not found`);
        }
        return note;
    };

    return {
        listNotebooks: defineTool({
            title: "List notebooks",
            description: "Lists all notebooks of the user with their number of notes.",
            inputSchema: z.object({}),
            effect: "read",
            execute: async () => (await notebooks.list(userId)).map(({ id, name, noteCount }) => ({ id, name, noteCount })),
        }),
        createNotebook: defineTool({
            title: "Create notebook",
            description: "Creates a new notebook.",
            inputSchema: z.object({ name: notebookNameSchema }),
            effect: "write",
            execute: async ({ name }) => {
                const { id } = await notebooks.create(userId, name);
                return { id, name };
            },
        }),
        renameNotebook: defineTool({
            title: "Rename notebook",
            description: "Renames a notebook.",
            inputSchema: z.object({ notebookId: z.string(), name: notebookNameSchema }),
            effect: "write",
            execute: async ({ notebookId, name }) => {
                await getNotebook(notebookId);
                await notebooks.rename(userId, notebookId, name);
                return { id: notebookId, name };
            },
        }),
        deleteNotebook: defineTool({
            title: "Delete notebook",
            description: "Deletes a notebook including all its notes. The user is asked to confirm.",
            inputSchema: z.object({ notebookId: z.string() }),
            effect: "delete",
            execute: async ({ notebookId }) => {
                const notebook = await getNotebook(notebookId);
                await notebooks.delete(userId, notebookId);
                return { deleted: { id: notebook.id, name: notebook.name } };
            },
        }),
        findNotes: defineTool({
            title: "Find notes",
            description: `Finds notes, in all notebooks or in one notebook. Returns at most ${maxSearchResults} notes, most recently changed first, with the beginning of their body as excerpt: read a note with getNote for its full body.`,
            inputSchema: z.object({
                notebookId: z.string().optional().describe("Only notes of this notebook"),
                query: z.string().trim().optional().describe("Only notes whose title or body contains this text (case-insensitive)"),
            }),
            effect: "read",
            execute: async ({ notebookId, query }) => {
                const rows = await notes.search(userId, { notebookId, query: query || undefined, limit: maxSearchResults });
                return rows.map(({ updatedAt, ...note }) => ({ ...note, updatedAt: updatedAt.toISOString() }));
            },
        }),
        getNote: defineTool({
            title: "Read note",
            description: "Returns a note with its full body (Markdown).",
            inputSchema: z.object({ id: z.string() }),
            effect: "read",
            execute: async ({ id }) => toolNote(await getNote(id)),
        }),
        createNote: defineTool({
            title: "Create note",
            description: "Creates a note in a notebook.",
            inputSchema: z.object({ notebookId: z.string(), title: titleSchema, body: bodySchema.default("") }),
            effect: "write",
            execute: async ({ notebookId, ...values }) => {
                await getNotebook(notebookId);
                const note = await notes.create(userId, notebookId, values);
                return { created: note && toolNote(note) };
            },
        }),
        updateNote: defineTool({
            title: "Update note",
            description:
                "Updates a note: change its title, replace its whole body, or move it to another notebook. Omitted fields stay unchanged. To add text to the end of a note, use appendToNote instead.",
            inputSchema: z.object({
                id: z.string(),
                title: titleSchema.optional(),
                body: bodySchema.optional().describe("The new body (Markdown), replaces the whole body"),
                notebookId: z.string().optional().describe("Moves the note to this notebook"),
            }),
            effect: "write",
            execute: async ({ id, ...values }) => {
                await getNote(id);
                if (values.notebookId !== undefined) {
                    await getNotebook(values.notebookId);
                }
                await notes.update(userId, id, values);
                return { updated: toolNote(await getNote(id)) };
            },
        }),
        appendToNote: defineTool({
            title: "Append to note",
            description: "Adds text (Markdown) to the end of a note, as a new paragraph.",
            inputSchema: z.object({ id: z.string(), text: z.string().trim().min(1).max(maxNoteBodyLength).describe("Markdown") }),
            effect: "write",
            execute: async ({ id, text }) => {
                const note = await getNote(id);
                if (note.body.length + text.length + 2 > maxNoteBodyLength) {
                    throw new Error(`The note would get longer than ${maxNoteBodyLength} characters`);
                }
                await notes.append(userId, id, text);
                return { appended: { id, title: note.title, text } };
            },
        }),
        deleteNote: defineTool({
            title: "Delete note",
            description: "Deletes a note. The user is asked to confirm.",
            inputSchema: z.object({ id: z.string() }),
            effect: "delete",
            execute: async ({ id }) => {
                const note = await getNote(id);
                await notes.delete(userId, id);
                return { deleted: { id: note.id, notebookId: note.notebookId, title: note.title } };
            },
        }),
    } satisfies Record<string, AppTool>;
}

// Guidance for the model on how to use the tools (system prompt of the chat assistant, instructions of the MCP server)
export const noteToolsInstructions = [
    "Notebooks and notes: the tools manage the user's notebooks and the notes in them. Note bodies are Markdown.",
    "To answer questions about the content of notes (e.g. summarize them), find them first and read their full body with getNote.",
    "To add to a note, use appendToNote. Use updateNote with a body only to rewrite a note: read it first and keep what the user didn't ask to change.",
    "Notes and todos are separate: to turn a note into todos, read the note and create the todos with the todo tools.",
];
