import { isDateString } from "~/dates";

import type { TodoFilter, TodoFilterModel, TodoSort } from "./db/todos.server";

// Grid state (pagination, sorting, filtering) lives in the URL, see src/searchParams.ts for the serialization:
// ?page=0&pageSize=25&sort=title:asc&sort=done:desc&filter=title:contains:milk&filter=dueDate:before:2026-11-06&filterLogic=or
export type TodoSearch = {
    page?: number;
    pageSize?: number;
    sort?: string[];
    filter?: string[];
    filterLogic?: "or";
};

export const pageSizeOptions = [10, 25, 50];
const defaultPageSize = 25;

export const filterOperators: { [Field in TodoFilter["field"]]: Extract<TodoFilter, { field: Field }>["operator"][] } = {
    title: ["contains", "equals", "startsWith", "endsWith"],
    description: ["contains", "equals", "startsWith", "endsWith"],
    dueDate: ["is", "after", "onOrAfter", "before", "onOrBefore"],
    done: ["is"],
    createdAt: ["after", "onOrAfter", "before", "onOrBefore"],
};

function isTodoField(field: string | undefined): field is TodoFilter["field"] {
    return field !== undefined && Object.hasOwn(filterOperators, field);
}

function toStringArray(value: unknown) {
    const items = [value ?? []].flat().map(String);
    return items.length > 0 ? items : undefined;
}

// Used as route validateSearch and as server function validator: accepts untrusted input
export function validateTodoSearch(search: unknown): TodoSearch {
    const { page, pageSize, sort, filter, filterLogic } = (typeof search === "object" && search !== null ? search : {}) as Record<string, unknown>;
    const pageNumber = Number.parseInt(String(page), 10);
    const pageSizeNumber = Number(pageSize);
    return {
        page: pageNumber > 0 ? pageNumber : undefined,
        pageSize: pageSizeOptions.includes(pageSizeNumber) && pageSizeNumber !== defaultPageSize ? pageSizeNumber : undefined,
        sort: toStringArray(sort),
        filter: toStringArray(filter),
        filterLogic: filterLogic === "or" ? "or" : undefined,
    };
}

export type TodoFilterItem = { field: TodoFilter["field"]; operator: string; value: string | undefined };

export function parseTodoSearch(search: TodoSearch) {
    const page = search.page ?? 0;
    const pageSize = search.pageSize ?? defaultPageSize;

    const sort: TodoSort[] = [];
    for (const param of search.sort ?? []) {
        const [field, direction] = param.split(":");
        if (isTodoField(field) && (direction === "asc" || direction === "desc") && !sort.some((item) => item.field === field)) {
            sort.push({ field, direction });
        }
    }

    const logicOperator = search.filterLogic ?? "and";
    const filter: TodoFilterModel = { items: [], logicOperator };
    // Items without a value are kept for the filter panel, but don't filter
    const filterItems: TodoFilterItem[] = [];
    for (const param of search.filter ?? []) {
        const [field, operator = "", ...rest] = param.split(":");
        const rawValue = rest.join(":");
        if (!isTodoField(field) || !(filterOperators[field] as string[]).includes(operator)) {
            continue;
        }
        filterItems.push({ field, operator, value: rawValue || undefined });
        const value = field === "done" ? rawValue === "true" : field === "createdAt" ? new Date(rawValue) : rawValue;
        const isValid = field === "dueDate" ? isDateString(value) : !(value instanceof Date && Number.isNaN(value.getTime()));
        if (rawValue && isValid) {
            filter.items.push({ field, operator, value } as TodoFilter);
        }
    }

    return { page, pageSize, sort, filter, filterItems };
}
