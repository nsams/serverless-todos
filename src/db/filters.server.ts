import { and, asc, desc, gte, lt, or, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { DateTimeOperator, TextOperator } from "~/gridSearch";

// SQL for the sorting and filtering of the grids (src/gridSearch.ts)

// The conditions of a grid's filter items, combined with its logic operator
export function filterModelCondition<Filter>(filter: { items: Filter[]; logicOperator: "and" | "or" }, condition: (item: Filter) => SQL | undefined) {
    const conditions = filter.items.map(condition);
    return filter.logicOperator === "or" ? or(...conditions) : and(...conditions);
}

// The order of a sorted column; text columns case-insensitive (SQLite compares binary by default)
export function sortOrder(column: SQLiteColumn, direction: "asc" | "desc", { caseInsensitive = false } = {}): SQL {
    const order = direction === "asc" ? asc : desc;
    return order(caseInsensitive ? sql`lower(${column})` : column);
}

// Case-insensitive (no ILIKE in SQLite), wildcards in the value are matched literally
export function textCondition(column: SQLiteColumn, operator: TextOperator, value: string): SQL {
    const escaped = value.toLowerCase().replace(/[\\%_]/g, "\\$&");
    const pattern = { contains: `%${escaped}%`, equals: escaped, startsWith: `${escaped}%`, endsWith: `%${escaped}` }[operator];
    return sql`lower(${column}) like ${pattern} escape '\\'`;
}

// Minute precision, like the DataGrid's dateTime filter
export function dateTimeCondition(column: SQLiteColumn, operator: DateTimeOperator, value: Date): SQL {
    const minute = new Date(value);
    minute.setSeconds(0, 0);
    const nextMinute = new Date(minute.getTime() + 60_000);
    return {
        after: gte(column, nextMinute),
        onOrAfter: gte(column, minute),
        before: lt(column, minute),
        onOrBefore: lt(column, nextMinute),
    }[operator];
}
