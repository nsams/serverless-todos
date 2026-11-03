import { and, asc, type Column, desc, eq, gt, gte, lt, lte, ne, or, type SQL, sql } from "drizzle-orm";

import type { FilterModel, GridFields, SortItem, TypedFilter } from "~/grid/fields";

// Any Drizzle table (both dialects) that has a column for each grid field
type GridTable<Fields extends GridFields> = { [Field in keyof Fields]: Column };

export function filterWhere<Fields extends GridFields>(table: GridTable<Fields>, fields: Fields, filter: FilterModel<Fields>): SQL | undefined {
    const conditions = filter.items.map((item) =>
        filterCondition(table[item.field], { type: fields[item.field], operator: item.operator, value: item.value } as TypedFilter),
    );
    return filter.logicOperator === "or" ? or(...conditions) : and(...conditions);
}

export function sortOrderBy<Fields extends GridFields>(table: GridTable<Fields>, fields: Fields, sort: SortItem<Fields>[]): SQL[] {
    return sort.map(({ field, direction }) => {
        // case-insensitive in both dialects (SQLite compares binary by default)
        const column = fields[field] === "string" ? sql`lower(${table[field]})` : table[field];
        return direction === "asc" ? asc(column) : desc(column);
    });
}

function filterCondition(column: Column, filter: TypedFilter): SQL | undefined {
    switch (filter.type) {
        case "string": {
            // case-insensitive in both dialects (no ILIKE in SQLite), wildcards in the value are matched literally
            const value = filter.value.toLowerCase().replace(/[\\%_]/g, "\\$&");
            const pattern = { contains: `%${value}%`, equals: value, startsWith: `${value}%`, endsWith: `%${value}` }[filter.operator];
            return sql`lower(${column}) like ${pattern} escape '\\'`;
        }
        case "number":
            return { "=": eq, "!=": ne, ">": gt, ">=": gte, "<": lt, "<=": lte }[filter.operator](column, filter.value);
        case "boolean":
            return eq(column, filter.value);
        case "dateTime": {
            // minute precision, like the DataGrid's dateTime filter
            const minute = new Date(filter.value);
            minute.setSeconds(0, 0);
            const nextMinute = new Date(minute.getTime() + 60_000);
            return {
                after: gte(column, nextMinute),
                onOrAfter: gte(column, minute),
                before: lt(column, minute),
                onOrBefore: lt(column, nextMinute),
            }[filter.operator];
        }
    }
}
