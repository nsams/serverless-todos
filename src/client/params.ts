import type { Params } from "react-router";

// A dynamic segment of the route's path (e.g. listId of "/lists/:listId"), always set when the route matches
export function pathParam(params: Params, name: string) {
    const value = params[name];
    if (value === undefined) {
        throw new Error(`The route has no param ${name}`);
    }
    return value;
}
