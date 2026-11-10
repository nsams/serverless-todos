import { useState } from "react";

// The previous value as long as it is equal (as JSON) to the new one: a stable reference for a value that is computed anew on every
// render (e.g. from the URL), for components and hooks that compare by reference
export function useStableValue<T>(value: T): T {
    const [stable, setStable] = useState(value);
    if (JSON.stringify(value) === JSON.stringify(stable)) {
        return stable;
    }
    setStable(value);
    return value;
}
