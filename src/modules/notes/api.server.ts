import { mutation, query, router } from "~/api/trpc.server";

import { noteOperations } from "./operations.server";

// The module's API for its pages (api.ts: notesApi.*): the operations the UI uses (src/operations.ts), mounted under the module's id.
// findNotes and appendToNote are for the AI assistants only.
export const notesRouter = router({
    listNotebooks: query(noteOperations.listNotebooks),
    getDefaultNotebook: mutation(noteOperations.getDefaultNotebook),
    createNotebook: mutation(noteOperations.createNotebook),
    renameNotebook: mutation(noteOperations.renameNotebook),
    deleteNotebook: mutation(noteOperations.deleteNotebook),
    listNotes: query(noteOperations.listNotes),
    getNote: query(noteOperations.getNote),
    createNote: mutation(noteOperations.createNote),
    updateNote: mutation(noteOperations.updateNote),
    deleteNote: mutation(noteOperations.deleteNote),
});

export type NotesRouter = typeof notesRouter;
