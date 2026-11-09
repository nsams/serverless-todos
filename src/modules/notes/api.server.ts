import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { createApi, gridQueryValidator } from "~/api/hono.server";

import { getNotebookRepository } from "./db/notebooks.server";
import { getNoteRepository } from "./db/notes.server";
import { maxNoteBodyLength, maxNotebookNameLength, maxNoteTitleLength } from "./limits";
import { parseNoteSearch, validateNoteSearch } from "./noteSearch";

// The module's REST API (notebooks and notes), mounted at /api (src/modules/registry.server.ts), see src/api/api.server.ts for the conventions

// Empty names and titles are reported to the user (422, see the handlers), invalid input otherwise is rejected (400)
const nameSchema = z.object({ name: z.string().trim().max(maxNotebookNameLength) });
const bodySchema = z.string().max(maxNoteBodyLength);

export const notesApi = createApi()
    // The user's notebooks with their number of notes: the module's navigation data (sidebar), see navigation.ts
    .get("/notebooks", async (c) => {
        return c.json(await getNotebookRepository().list(c.var.user.id));
    })
    // The notebook shown on /notes, created if the user has none yet (POST: it may create a notebook)
    .post("/notebooks/default", async (c) => {
        const { id } = await getNotebookRepository().getOrCreateDefault(c.var.user.id);
        return c.json({ id });
    })
    .post("/notebooks", zValidator("json", nameSchema), async (c) => {
        const { name } = c.req.valid("json");
        if (!name) {
            return c.json({ error: "Name is required" }, 422);
        }
        const { id } = await getNotebookRepository().create(c.var.user.id, name);
        return c.json({ id }, 201);
    })
    .patch("/notebooks/:notebookId", zValidator("json", nameSchema), async (c) => {
        const { name } = c.req.valid("json");
        if (!name) {
            return c.json({ error: "Name is required" }, 422);
        }
        await getNotebookRepository().rename(c.var.user.id, c.req.param("notebookId"), name);
        return c.body(null, 204);
    })
    // Deletes the notebook's notes too
    .delete("/notebooks/:notebookId", async (c) => {
        await getNotebookRepository().delete(c.var.user.id, c.req.param("notebookId"));
        return c.body(null, 204);
    })
    // The notes of a notebook for its grid: one page, sorted and filtered as in the query (the grid state in the page's URL, src/gridSearch.ts),
    // q: only notes whose title or body contains it
    .get("/notebooks/:notebookId/notes", gridQueryValidator, async (c) => {
        const { user } = c.var;
        const notebook = await getNotebookRepository().get(user.id, c.req.param("notebookId"));
        if (!notebook) {
            return c.json({ error: "Not found" }, 404);
        }
        const { page, pageSize, sort, filter, query } = parseNoteSearch(validateNoteSearch(c.req.valid("query")));
        const { rows, totalCount } = await getNoteRepository().list(user.id, notebook.id, {
            offset: page * pageSize,
            limit: pageSize,
            sort,
            filter,
            query,
        });
        return c.json({ notebook, notes: rows, totalCount });
    })
    .post("/notebooks/:notebookId/notes", zValidator("json", z.object({ title: z.string().trim().max(maxNoteTitleLength) })), async (c) => {
        const { title } = c.req.valid("json");
        if (!title) {
            return c.json({ error: "Title is required" }, 422);
        }
        const note = await getNoteRepository().create(c.var.user.id, c.req.param("notebookId"), { title, body: "" });
        if (!note) {
            return c.json({ error: "Not found" }, 404);
        }
        return c.json({ id: note.id }, 201);
    })
    .get("/notes/:noteId", async (c) => {
        const note = await getNoteRepository().get(c.var.user.id, c.req.param("noteId"));
        if (!note) {
            return c.json({ error: "Not found" }, 404);
        }
        return c.json(note);
    })
    // Changes the given fields; notebookId moves the note to another notebook
    .patch(
        "/notes/:noteId",
        zValidator(
            "json",
            z.object({
                title: z.string().trim().min(1).max(maxNoteTitleLength).optional(),
                body: bodySchema.optional(),
                notebookId: z.string().optional(),
            }),
        ),
        async (c) => {
            const updatedAt = await getNoteRepository().update(c.var.user.id, c.req.param("noteId"), c.req.valid("json"));
            if (!updatedAt) {
                return c.json({ error: "Not found" }, 404);
            }
            // the editor tells its own changes from changes made elsewhere (e.g. by the assistant) by updatedAt
            return c.json({ updatedAt });
        },
    )
    .delete("/notes/:noteId", async (c) => {
        await getNoteRepository().delete(c.var.user.id, c.req.param("noteId"));
        return c.body(null, 204);
    });
