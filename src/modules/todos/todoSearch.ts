import { isDateString } from "~/dates";
import { dateTimeOperators, type GridFieldConfig, type GridSearch, parseDateTime, parseGridSearch, textOperators } from "~/gridSearch";

import type { TodoFilter, TodoFilterModel } from "./db/todos.server";

// The grid state of a list (pagination, sorting, filtering) lives in the URL, see src/gridSearch.ts

// The filterable fields: the operators of each field's filter type (TodoFilter) and how its value is read from the URL
export const todoFields: {
    [Field in TodoFilter["field"]]: GridFieldConfig & { operators: readonly Extract<TodoFilter, { field: Field }>["operator"][] };
} = {
    title: { operators: textOperators, parseValue: (value) => value },
    description: { operators: textOperators, parseValue: (value) => value },
    dueDate: { operators: ["is", ...dateTimeOperators], parseValue: (value) => (isDateString(value) ? value : undefined) },
    done: { operators: ["is"], parseValue: (value) => value === "true" },
    createdAt: { operators: dateTimeOperators, parseValue: parseDateTime },
};

export function parseTodoSearch(search: GridSearch) {
    const { filter, ...rest } = parseGridSearch(search, todoFields);
    // the values are parsed by the fields' parseValue, so they match the filter types
    return { ...rest, filter: filter as TodoFilterModel };
}
