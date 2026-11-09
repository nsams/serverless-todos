import type { GridFilterOperator } from "@mui/x-data-grid-pro";
import { z } from "zod";

// The state (pagination, sorting, filtering) of a DataGrid with server-side data lives in the URL, see src/searchParams.ts for the serialization:
// ?page=0&pageSize=25&sort=title:asc&sort=done:desc&filter=title:contains:milk&filter=dueDate:before:2026-11-06&filterLogic=or
// Used by the grids of the modules (e.g. the todos of a list, the notes of a notebook); the SQL conditions are in src/db/filters.server.ts.
export type GridSearch = {
    page?: number;
    pageSize?: number;
    sort?: string[];
    filter?: string[];
    filterLogic?: "or";
};

export const pageSizeOptions = [10, 25, 50];
const defaultPageSize = 25;

// Filter operators supported by the server (names of the DataGrid's operators)
export const textOperators = ["contains", "equals", "startsWith", "endsWith"] as const;
export type TextOperator = (typeof textOperators)[number];
// minute precision, like the DataGrid's dateTime filter
export const dateTimeOperators = ["after", "onOrAfter", "before", "onOrBefore"] as const;
export type DateTimeOperator = (typeof dateTimeOperators)[number];

// The sortable and filterable fields of a grid: their filter operators and how a filter value is read from the URL
// (undefined: invalid, the item doesn't filter)
export type GridFieldConfig = { operators: readonly string[]; parseValue: (value: string) => unknown };

export function parseDateTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function toStringArray(value: unknown) {
    const items = [value ?? []].flat().map(String);
    return items.length > 0 ? items : undefined;
}

// Used as route validateSearch and as API input validator: accepts untrusted input
export function validateGridSearch(search: unknown): GridSearch {
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

// Input validator of an API procedure that loads the rows of a grid: the given params (e.g. the list id) plus the search params,
// normalized leniently (invalid values are dropped) with the route's validateSearch, like in the route
export function gridInputSchema<Shape extends z.ZodRawShape, Search>(shape: Shape, validateSearch: (search: unknown) => Search) {
    return z.looseObject(shape).transform((data) => {
        const params = Object.fromEntries(Object.keys(shape).map((key) => [key, data[key]])) as z.output<z.ZodObject<Shape>>;
        return { ...validateSearch(data), ...params };
    });
}

// The page to redirect a grid to when the requested page is empty, but there are rows on earlier pages
// (e.g. after deleting the last row of the last page); undefined if the page is fine
export function lastPageWithRows({ page, pageSize }: { page: number; pageSize: number }, rowsOnPage: number, totalCount: number) {
    if (rowsOnPage > 0 || page === 0) {
        return undefined;
    }
    return Math.max(0, Math.ceil(totalCount / pageSize) - 1);
}

export type GridSort<Field extends string> = { field: Field; direction: "asc" | "desc" };

// value: parsed by the field's parseValue; the modules narrow the items to their filter types
export type GridFilter<Field extends string> = { field: Field; operator: string; value: unknown };

export type GridFilterItem<Field extends string> = { field: Field; operator: string; value: string | undefined };

export function parseGridSearch<Field extends string>(search: GridSearch, fields: Record<Field, GridFieldConfig>) {
    const isField = (field: string | undefined): field is Field => field !== undefined && Object.hasOwn(fields, field);

    const page = search.page ?? 0;
    const pageSize = search.pageSize ?? defaultPageSize;

    const sort: GridSort<Field>[] = [];
    for (const param of search.sort ?? []) {
        const [field, direction] = param.split(":");
        if (isField(field) && (direction === "asc" || direction === "desc") && !sort.some((item) => item.field === field)) {
            sort.push({ field, direction });
        }
    }

    const logicOperator = search.filterLogic ?? "and";
    const filter: { items: GridFilter<Field>[]; logicOperator: "and" | "or" } = { items: [], logicOperator };
    // Items without a (valid) value are kept for the filter panel, but don't filter
    const filterItems: GridFilterItem<Field>[] = [];
    for (const param of search.filter ?? []) {
        const [field, operator = "", ...rest] = param.split(":");
        const rawValue = rest.join(":");
        if (!isField(field) || !fields[field].operators.includes(operator)) {
            continue;
        }
        filterItems.push({ field, operator, value: rawValue || undefined });
        const value = rawValue ? fields[field].parseValue(rawValue) : undefined;
        if (value !== undefined) {
            filter.items.push({ field, operator, value });
        }
    }

    return { page, pageSize, sort, filter, filterItems };
}

// The DataGrid's operators that the server supports for a field
export function supportedOperators(operators: GridFilterOperator[], supported: readonly string[]) {
    return operators.filter((operator) => supported.includes(operator.value));
}

// A filter value of the DataGrid for the URL. dateOnly: the grid's date filter input creates dates at UTC midnight (new Date("YYYY-MM-DD"))
export function serializeFilterValue(value: unknown, { dateOnly = false } = {}) {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return "";
        }
        return dateOnly ? value.toISOString().slice(0, 10) : value.toISOString();
    }
    return value == null ? "" : String(value);
}
