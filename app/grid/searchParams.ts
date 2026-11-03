import {
    getGridBooleanOperators,
    getGridDateOperators,
    getGridNumericOperators,
    getGridStringOperators,
    type GridFilterModel,
    type GridFilterOperator,
    GridLogicOperator,
    type GridSortModel,
} from "@mui/x-data-grid-pro";

import {
    type FieldType,
    type FilterModel,
    type GridFields,
    isField,
    isFilterOperator,
    type ListOptions,
    parseFilterValue,
    type SortItem,
} from "./fields";

export const pageSizeOptions = [10, 25, 50];
const defaultPageSize = 25;

// Grid state (pagination, sorting, filtering) lives in the URL, parsed the same way on server and client:
// ?page=0&pageSize=25&sort=title:asc&sort=done:desc&filter=title:contains:milk&filter=done:is:false&filterLogic=or
export function parseGridState<Fields extends GridFields>(searchParams: URLSearchParams, fields: Fields) {
    const page = Math.max(0, Number.parseInt(searchParams.get("page") ?? "", 10) || 0);
    const requestedPageSize = Number(searchParams.get("pageSize"));
    const pageSize = pageSizeOptions.includes(requestedPageSize) ? requestedPageSize : defaultPageSize;

    const sort: SortItem<Fields>[] = [];
    for (const param of searchParams.getAll("sort")) {
        const [field, direction] = param.split(":");
        if (isField(fields, field) && (direction === "asc" || direction === "desc") && !sort.some((item) => item.field === field)) {
            sort.push({ field, direction });
        }
    }
    const sortModel: GridSortModel = sort.map(({ field, direction }) => ({ field, sort: direction }));

    const logicOperator = searchParams.get("filterLogic") === "or" ? "or" : "and";
    const filter: FilterModel<Fields> = { items: [], logicOperator };
    const filterModel: GridFilterModel = { items: [], logicOperator: logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And };
    for (const param of searchParams.getAll("filter")) {
        const [field, operator = "", ...rest] = param.split(":");
        const rawValue = rest.join(":");
        if (!isField(fields, field) || !isFilterOperator(fields[field], operator)) {
            continue;
        }
        // Items without a value are kept for the filter panel, but don't filter
        filterModel.items.push({ id: filterModel.items.length, field, operator, value: rawValue || undefined });
        const value = rawValue ? parseFilterValue(fields[field], rawValue) : undefined;
        if (value !== undefined) {
            filter.items.push({ field, operator, value } as FilterModel<Fields>["items"][number]);
        }
    }

    const listOptions: ListOptions<Fields> = { offset: page * pageSize, limit: pageSize, sort, filter };
    return { page, pageSize, sortModel, filterModel, listOptions };
}

// Inverse of parseGridState, for onSortModelChange
export function sortModelToSearchParams(model: GridSortModel) {
    return { page: undefined, sort: model.map((item) => `${item.field}:${item.sort}`) };
}

// Inverse of parseGridState, for onFilterModelChange
export function filterModelToSearchParams(model: GridFilterModel) {
    return {
        page: undefined,
        filter: model.items.map((item) => `${item.field}:${item.operator}:${serializeFilterValue(item.value)}`),
        filterLogic: model.logicOperator === GridLogicOperator.Or ? "or" : undefined,
    };
}

function serializeFilterValue(value: unknown) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? "" : value.toISOString();
    }
    return value == null ? "" : String(value);
}

const gridOperatorsByType: Record<FieldType, () => GridFilterOperator[]> = {
    string: getGridStringOperators,
    number: getGridNumericOperators,
    boolean: getGridBooleanOperators,
    dateTime: () => getGridDateOperators(true),
};

// The DataGrid's filter operators for a field type, restricted to the ones the server supports (GridColDef.filterOperators)
export function gridFilterOperators(type: FieldType) {
    return gridOperatorsByType[type]().filter((operator) => isFilterOperator(type, operator.value));
}
