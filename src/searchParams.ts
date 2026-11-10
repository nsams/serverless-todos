// Search params as plain URLSearchParams: arrays are repeated keys (?sort=title:asc&sort=done:desc), all values are strings.
// The pages type them with their validateSearch (e.g. validateGridSearch), the API validates the query with the operation's schema.

export function parseSearch(searchStr: string) {
    const searchParams = new URLSearchParams(searchStr);
    const search: Record<string, string | string[]> = {};
    for (const key of new Set(searchParams.keys())) {
        const values = searchParams.getAll(key);
        search[key] = values.length === 1 ? values[0] : values;
    }
    return search;
}

export function stringifySearch(search: Record<string, unknown>) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
        for (const item of [value ?? []].flat()) {
            searchParams.append(key, String(item));
        }
    }
    const searchStr = searchParams.toString();
    return searchStr ? `?${searchStr}` : "";
}
