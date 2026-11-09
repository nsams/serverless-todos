import {
    dateTimeOperators,
    type GridFieldConfig,
    type GridSearch,
    parseDateTime,
    parseGridSearch,
    textOperators,
    validateGridSearch,
} from "~/gridSearch";

import type { NoteFilter, NoteFilterModel } from "./db/notes.server";

// The grid state of a notebook (pagination, sorting, filtering, see src/gridSearch.ts) and the search text (?q=) live in the URL.
// The open note keeps them, so its back link returns to the same view of the grid.
export type NoteSearch = GridSearch & { q?: string };

// Reads the search params (parsed with parseSearch) in the loaders and in the components: accepts untrusted input
export function validateNoteSearch(search: unknown): NoteSearch {
    const { q } = (typeof search === "object" && search !== null ? search : {}) as Record<string, unknown>;
    return { ...validateGridSearch(search), q: typeof q === "string" && q.trim() ? q : undefined };
}

// The filterable fields: the operators of each field's filter type (NoteFilter) and how its value is read from the URL
export const noteFields: {
    [Field in NoteFilter["field"]]: GridFieldConfig & { operators: readonly Extract<NoteFilter, { field: Field }>["operator"][] };
} = {
    title: { operators: textOperators, parseValue: (value) => value },
    body: { operators: textOperators, parseValue: (value) => value },
    createdAt: { operators: dateTimeOperators, parseValue: parseDateTime },
    updatedAt: { operators: dateTimeOperators, parseValue: parseDateTime },
};

export function parseNoteSearch(search: NoteSearch) {
    const { filter, ...rest } = parseGridSearch(search, noteFields);
    // the values are parsed by the fields' parseValue, so they match the filter types
    return { ...rest, filter: filter as NoteFilterModel, query: search.q?.trim() || undefined };
}
