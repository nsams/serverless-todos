import { type PathParam, useMatch } from "react-router";

// The params of the page's path, typed by its path pattern, e.g. usePathParams(listPath) → { listId: string }.
// Only for the page of that path (and its components), and for patterns without optional segments: every param is set.
export function usePathParams<Path extends string>(path: Path) {
    const match = useMatch(path);
    if (match === null) {
        throw new Error(`The page doesn't match ${path}`);
    }
    // the pattern matched, so its (required) params have values
    return match.params as Record<PathParam<Path>, string>;
}
