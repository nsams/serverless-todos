// Generic, table-independent description of a server-side DataGrid (filtering, sorting, pagination).
// Shared by server (query building) and client (URL state, DataGrid filter operators), so no server-only imports here.

// Supported DataGrid filter operators per field type
export const filterOperators = {
    string: ["contains", "equals", "startsWith", "endsWith"],
    number: ["=", "!=", ">", ">=", "<", "<="],
    boolean: ["is"],
    dateTime: ["after", "onOrAfter", "before", "onOrBefore"],
} as const;

export type FieldType = keyof typeof filterOperators;

type FieldValue = { string: string; number: number; boolean: boolean; dateTime: Date };

// The fields of a table that may be filtered and sorted by, e.g. { title: "string", done: "boolean" }.
// Doubles as allowlist: fields not listed here (e.g. userId) can't be filtered or sorted by.
export type GridFields = Record<string, FieldType>;

type FieldName<Fields extends GridFields> = keyof Fields & string;

export type SortItem<Fields extends GridFields> = { field: FieldName<Fields>; direction: "asc" | "desc" };

export type FilterItem<Fields extends GridFields> = {
    [Field in FieldName<Fields>]: { field: Field; operator: (typeof filterOperators)[Fields[Field]][number]; value: FieldValue[Fields[Field]] };
}[FieldName<Fields>];

export type FilterModel<Fields extends GridFields> = { items: FilterItem<Fields>[]; logicOperator: "and" | "or" };

export type ListOptions<Fields extends GridFields> = { offset: number; limit: number; sort: SortItem<Fields>[]; filter: FilterModel<Fields> };

// A filter discriminated by field type instead of field name, for type-generic handling
export type TypedFilter = {
    [Type in FieldType]: { type: Type; operator: (typeof filterOperators)[Type][number]; value: FieldValue[Type] };
}[FieldType];

export function isField<Fields extends GridFields>(fields: Fields, field: string | undefined): field is FieldName<Fields> {
    return field !== undefined && Object.hasOwn(fields, field);
}

export function isFilterOperator(type: FieldType, operator: string) {
    return (filterOperators[type] as readonly string[]).includes(operator);
}

// Returns undefined for invalid values
export function parseFilterValue(type: FieldType, rawValue: string): TypedFilter["value"] | undefined {
    switch (type) {
        case "string":
            return rawValue;
        case "number": {
            const value = Number(rawValue);
            return rawValue.trim() !== "" && Number.isFinite(value) ? value : undefined;
        }
        case "boolean":
            return rawValue === "true";
        case "dateTime": {
            const value = new Date(rawValue);
            return Number.isNaN(value.getTime()) ? undefined : value;
        }
    }
}
