import { isDateString } from "~/dates";
import {
    dateTimeField,
    dateTimeOperators,
    gridField,
    type GridFilterModel,
    type GridSearch,
    gridSearchSchema,
    type GridSort,
    parseGridSearch,
    textField,
} from "~/gridSearch";

// The grid state of a list (pagination, sorting, filtering) lives in the URL, see src/gridSearch.ts

// The search params of a list's page, also the input of the operation that loads its todos (listTodos)
export const todoSearchSchema = gridSearchSchema;

// The sortable and filterable fields: the operators of each field and how its value is read from the URL
export const todoFields = {
    title: textField,
    description: textField,
    // YYYY-MM-DD
    dueDate: gridField(["is", ...dateTimeOperators], (value) => (isDateString(value) ? value : undefined)),
    done: gridField(["is"], (value) => value === "true"),
    createdAt: dateTimeField,
};

export type TodoSort = GridSort<keyof typeof todoFields>;

// e.g. { items: [{ field: "dueDate", operator: "before", value: "2026-11-06" }], logicOperator: "and" }
export type TodoFilterModel = GridFilterModel<typeof todoFields>;

export type TodoFilter = TodoFilterModel["items"][number];

export function parseTodoSearch(search: GridSearch) {
    return parseGridSearch(search, todoFields);
}
