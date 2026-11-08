import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Date and time in the user's locale and time zone. Empty while rendering on the server (and during hydration), as the server doesn't know them.
export function DateTime({ value }: { value: Date }) {
    const formatted = useSyncExternalStore(
        subscribe,
        () => value.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
        () => "",
    );
    return <time dateTime={value.toISOString()}>{formatted}</time>;
}
