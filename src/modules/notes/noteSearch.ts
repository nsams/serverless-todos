// The search text of a notebook page lives in the URL (?q=...), also while a note is open
export type NoteSearch = { q?: string };

// Used as route validateSearch: accepts untrusted input
export function validateNoteSearch(search: unknown): NoteSearch {
    const { q } = (typeof search === "object" && search !== null ? search : {}) as Record<string, unknown>;
    return { q: typeof q === "string" && q ? q : undefined };
}
