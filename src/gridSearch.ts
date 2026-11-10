import type { GridColDef, GridFilterOperator, GridValidRowModel } from "@mui/x-data-grid-pro";
import { z } from "zod";

// The state (pagination, sorting, filtering) of a DataGrid with server-side data lives in the URL, see src/searchParams.ts for the serialization:
// ?page=0&pageSize=25&sort=title:asc&sort=done:desc&filter=title:contains:milk&filter=dueDate:before:2026-11-06&filterLogic=or
// Used by the grids of the modules (e.g. the todos of a list, the notes of a notebook): one schema per grid (gridSearchSchema, extended
// by the module, e.g. with a search text) validates the search params of the page and the input of the operation that loads the rows;
// parseGridSearch turns it into sorting and filters typed by the grid's fields. The SQL conditions are in src/db/filters.server.ts.

export const pageSizeOptions = [10, 25, 50];
const defaultPageSize = 25;

// Filter operators supported by the server (names of the DataGrid's operators)
export const textOperators = ["contains", "equals", "startsWith", "endsWith"] as const;
export type TextOperator = (typeof textOperators)[number];
// minute precision, like the DataGrid's dateTime filter
export const dateTimeOperators = ["after", "onOrAfter", "before", "onOrBefore"] as const;
export type DateTimeOperator = (typeof dateTimeOperators)[number];

// A sortable and filterable field of a grid: its filter operators and how a filter value is read from the URL
// (undefined: invalid, the item doesn't filter)
export type GridFieldConfig<Operator extends string = string, Value = unknown> = {
    operators: readonly Operator[];
    parseValue: (value: string) => Value | undefined;
};

export type GridFields = Record<string, GridFieldConfig>;

// Infers the operators and the value type of a field
export function gridField<const Operator extends string, Value>(operators: readonly Operator[], parseValue: (value: string) => Value | undefined) {
    return { operators, parseValue } satisfies GridFieldConfig<Operator, Value>;
}

export function parseDateTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

export const textField = gridField(textOperators, (value) => value);
export const dateTimeField = gridField(dateTimeOperators, parseDateTime);

// Search params are untrusted: invalid values are dropped instead of failing (e.g. a hand-edited URL still shows the grid)
function lenient<Schema extends z.ZodType>(schema: Schema) {
    return schema.optional().catch(undefined);
}

// a repeated search param (?sort=a&sort=b) is an array, a single one a string
const stringArraySchema = z
    .union([z.string(), z.array(z.string())])
    .transform((value) => [value].flat())
    .refine((items) => items.length > 0);

// The search params of a grid. Extended by a module for its extras, e.g. noteSearchSchema with the search text ?q=
export const gridSearchSchema = z.object({
    // 0-based, the first page isn't in the URL
    page: lenient(z.coerce.number().int().positive()),
    // only the options of the grid, the default isn't in the URL
    pageSize: lenient(z.coerce.number().refine((value) => pageSizeOptions.includes(value) && value !== defaultPageSize)),
    // field:direction
    sort: lenient(stringArraySchema),
    // field:operator:value
    filter: lenient(stringArraySchema),
    filterLogic: lenient(z.literal("or")),
});

export type GridSearch = z.output<typeof gridSearchSchema>;

// Used as route validateSearch: accepts untrusted input
export function validateGridSearch(search: unknown): GridSearch {
    return gridSearchSchema.catch({}).parse(search);
}

// The page to redirect a grid's loader to when the requested page is empty, but there are rows on earlier pages
// (e.g. after deleting the last row of the last page); undefined if the page is fine
export function lastPageWithRows({ page, pageSize }: { page: number; pageSize: number }, rowsOnPage: number, totalCount: number) {
    if (rowsOnPage > 0 || page === 0) {
        return undefined;
    }
    return Math.max(0, Math.ceil(totalCount / pageSize) - 1);
}

export type GridSort<Field extends string> = { field: Field; direction: "asc" | "desc" };

// A filter item of a grid with fields Fields: field, one of its operators and its parsed value (e.g. a Date for a dateTime field).
// A union over the fields, so the repositories can switch on the field (see e.g. TodoFilter in src/modules/todos/todoSearch.ts).
export type GridFilter<Fields extends GridFields> = {
    [Field in keyof Fields & string]: Fields[Field] extends GridFieldConfig<infer Operator, infer Value>
        ? { field: Field; operator: Operator; value: Value }
        : never;
}[keyof Fields & string];

export type GridFilterModel<Fields extends GridFields> = { items: GridFilter<Fields>[]; logicOperator: "and" | "or" };

// A filter item as shown in the filter panel (also without a valid value)
export type GridFilterItem<Field extends string> = { field: Field; operator: string; value: string | undefined };

export function parseGridSearch<Fields extends GridFields>(search: GridSearch, fields: Fields) {
    type Field = keyof Fields & string;
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

    const filter: GridFilterModel<Fields> = { items: [], logicOperator: search.filterLogic ?? "and" };
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
            // the operator is one of the field's operators and the value parsed by the field's parseValue, so this is the field's filter type
            filter.items.push({ field, operator, value } as GridFilter<Fields>);
        }
    }

    return { page, pageSize, sort, filter, filterItems };
}

// The columns of a grid: a column shows a field of the row or a filter field of the server (e.g. a note's body, shown as excerpt),
// so renaming a field breaks the build instead of the column
export type GridColumns<Row extends GridValidRowModel, Fields extends GridFields = Record<never, never>> = Array<
    GridColDef<Row> & { field: ((keyof Row | keyof Fields) & string) | "actions" }
>;

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
