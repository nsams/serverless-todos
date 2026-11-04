import { type GridFilterModel, GridLogicOperator, type GridSortModel } from "@mui/x-data-grid-pro";

import type { TodoFilter, TodoFilterModel, TodoSort } from "~/db/todos.server";

export const pageSizeOptions = [10, 25, 50];

export const filterOperators: { [Field in TodoFilter["field"]]: Extract<TodoFilter, { field: Field }>["operator"][] } = {
    title: ["contains", "equals", "startsWith", "endsWith"],
    done: ["is"],
    createdAt: ["after", "onOrAfter", "before", "onOrBefore"],
};

function isTodoField(field: string | undefined): field is TodoFilter["field"] {
    return field !== undefined && Object.hasOwn(filterOperators, field);
}

// Pagination and sorting live in the page URL, filtering only in component state.
// The todo list (see routes/todos.list.ts) is loaded with all of them as search params, parsed the same way on server and client:
// ?page=0&pageSize=25&sort=title:asc&sort=done:desc&filter=title:contains:milk&filter=done:is:false&filterLogic=or
export function parseGridState(searchParams: URLSearchParams) {
    const page = Math.max(0, Number.parseInt(searchParams.get("page") ?? "", 10) || 0);
    const requestedPageSize = Number(searchParams.get("pageSize"));
    const pageSize = pageSizeOptions.includes(requestedPageSize) ? requestedPageSize : 25;

    const sort: TodoSort[] = [];
    for (const param of searchParams.getAll("sort")) {
        const [field, direction] = param.split(":");
        if (isTodoField(field) && (direction === "asc" || direction === "desc") && !sort.some((item) => item.field === field)) {
            sort.push({ field, direction });
        }
    }
    const sortModel: GridSortModel = sort.map(({ field, direction }) => ({ field, sort: direction }));

    const filter: TodoFilterModel = { items: [], logicOperator: searchParams.get("filterLogic") === "or" ? "or" : "and" };
    for (const param of searchParams.getAll("filter")) {
        const [field, operator = "", ...rest] = param.split(":");
        const rawValue = rest.join(":");
        if (!isTodoField(field) || !(filterOperators[field] as string[]).includes(operator) || !rawValue) {
            continue;
        }
        const value = field === "done" ? rawValue === "true" : field === "createdAt" ? new Date(rawValue) : rawValue;
        if (!(value instanceof Date && Number.isNaN(value.getTime()))) {
            filter.items.push({ field, operator, value } as TodoFilter);
        }
    }

    return { page, pageSize, sort, sortModel, filter };
}

function serializeFilterValue(value: unknown) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? "" : value.toISOString();
    }
    return value == null ? "" : String(value);
}

export function filterModelToSearchParams(filterModel: GridFilterModel) {
    const searchParams = new URLSearchParams();
    for (const item of filterModel.items) {
        const value = serializeFilterValue(item.value);
        // Items without a value (e.g. while editing in the filter panel) don't filter
        if (value) {
            searchParams.append("filter", `${item.field}:${item.operator}:${value}`);
        }
    }
    if (filterModel.logicOperator === GridLogicOperator.Or) {
        searchParams.set("filterLogic", "or");
    }
    return searchParams;
}
