// Search params as plain URLSearchParams: arrays are repeated keys (?sort=title:asc&sort=done:desc), all values are strings.
// The pages type them with their validateSearch (e.g. validateGridSearch), the API does the same with the query.

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

// The search params of a location (e.g. useLocation().search), typed by validateSearch
export function readSearch<Search>(searchStr: string, validateSearch: (search: unknown) => Search) {
    return validateSearch(parseSearch(searchStr));
}

// Search params as query of the typed API client (src/api/client.ts), e.g. a grid's state for the request of its rows
export function toQuery(search: Record<string, unknown>) {
    return parseSearch(stringifySearch(search));
}
