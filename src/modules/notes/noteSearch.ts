import { z } from "zod";

import { dateTimeField, type GridFilterModel, gridSearchSchema, type GridSort, parseGridSearch, textField } from "~/gridSearch";

// The grid state of a notebook (pagination, sorting, filtering, see src/gridSearch.ts) and the search text (?q=) live in the URL.
// The open note keeps them, so its back link returns to the same view of the grid.

// The search params of a notebook's page (and of the open note), also the input of the operation that loads its notes (listNotes)
export const noteSearchSchema = gridSearchSchema.extend({
    // only notes whose title or body contains it; kept as typed (not trimmed), it's the value of the search field
    q: z
        .string()
        .refine((value) => value.trim() !== "")
        .optional()
        .catch(undefined),
});

export type NoteSearch = z.output<typeof noteSearchSchema>;

// Used as route validateSearch: accepts untrusted input
export function validateNoteSearch(search: unknown): NoteSearch {
    return noteSearchSchema.catch({}).parse(search);
}

// The sortable and filterable fields: the operators of each field and how its value is read from the URL
export const noteFields = {
    title: textField,
    body: textField,
    createdAt: dateTimeField,
    updatedAt: dateTimeField,
};

export type NoteSort = GridSort<keyof typeof noteFields>;

export type NoteFilterModel = GridFilterModel<typeof noteFields>;

export type NoteFilter = NoteFilterModel["items"][number];

export function parseNoteSearch(search: NoteSearch) {
    return { ...parseGridSearch(search, noteFields), query: search.q?.trim() || undefined };
}
