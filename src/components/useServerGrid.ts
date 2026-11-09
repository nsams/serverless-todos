import { type DataGridProProps, type GridFilterModel, GridLogicOperator, type GridSortModel } from "@mui/x-data-grid-pro";
import { useMatch, useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { type GridFieldConfig, type GridSearch, pageSizeOptions, parseGridSearch, serializeFilterValue } from "~/gridSearch";

type Options<Search extends GridSearch> = {
    // the route's validateSearch
    validateSearch: (search: unknown) => Search;
    // changes the route's search params (keeping the scroll position), e.g. with the route's useNavigate:
    // (search, { replace }) => void navigate({ search, replace, resetScroll: false })
    navigate: (search: Search, options: { replace: boolean }) => void;
    // the sortable and filterable fields
    fields: Record<string, GridFieldConfig>;
    // the number of rows on the server (with the filters applied)
    rowCount: number;
    // fields with calendar date filters (YYYY-MM-DD), e.g. a due date
    dateOnlyFields?: string[];
};

// A DataGrid with server-side pagination, sorting and filtering whose state lives in the URL (see src/gridSearch.ts):
// gridProps connect the grid to the URL, the route's loader loads the rows for it from the API (parseGridSearch on the server).
export function useServerGrid<Search extends GridSearch>({ validateSearch, fields, navigate, rowCount, dateOnlyFields = [] }: Options<Search>) {
    // the page's route match (the nearest one), e.g. /lists/$listId with its search params
    const match = useMatch({ strict: false });
    // Use the pending location's search params while loading, otherwise the grid would show the old state until the loader is done
    // (e.g. reset a filter value while typing); not while leaving the page (another path)
    const search = validateSearch(
        useRouterState({ select: ({ location }) => (location.pathname === match.pathname ? location.search : match.search) }),
    );
    // Only while the grid's state changes, not while the page itself is loading (initially or coming from another page)
    const loading = useRouterState({
        select: ({ status, location, resolvedLocation }) =>
            status === "pending" &&
            resolvedLocation?.pathname === match.pathname &&
            location.pathname === match.pathname &&
            location.href !== resolvedLocation.href,
    });
    const { page, pageSize, sort, filter, filterItems } = parseGridSearch(search, fields);

    // The DataGrid compares its models by reference: a new but equal model is applied again and counts as a change (the grid then
    // goes back to the first page, e.g. right after going to the next page), so they only change when the URL's state does
    const sortModel: GridSortModel = useStableValue(sort.map(({ field, direction }) => ({ field, sort: direction })));
    const filterModel: GridFilterModel = useStableValue({
        items: filterItems.map((item, index) => ({ id: index, ...item })),
        logicOperator: filter.logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And,
    });

    // Changes search params, e.g. a search field next to the grid (also goes back to the first page)
    const updateSearch = (values: Partial<Search>, { replace = false } = {}) => navigate({ ...search, page: undefined, ...values }, { replace });

    const gridProps = {
        pagination: true,
        paginationMode: "server",
        sortingMode: "server",
        filterMode: "server",
        rowCount,
        loading,
        pageSizeOptions,
        paginationModel: { page, pageSize },
        onPaginationModelChange: (model) => navigate({ ...search, page: model.page, pageSize: model.pageSize }, { replace: false }),
        sortModel,
        onSortModelChange: (model) =>
            navigate({ ...search, page: undefined, sort: model.map((item) => `${item.field}:${item.sort}`) }, { replace: false }),
        filterModel,
        onFilterModelChange: (model) =>
            navigate(
                {
                    ...search,
                    page: undefined,
                    filter: model.items.map(
                        (item) =>
                            `${item.field}:${item.operator}:${serializeFilterValue(item.value, { dateOnly: dateOnlyFields.includes(item.field) })}`,
                    ),
                    filterLogic: model.logicOperator === GridLogicOperator.Or ? "or" : undefined,
                },
                // no history entry per keystroke
                { replace: true },
            ),
    } satisfies Partial<DataGridProProps>;

    // search: the current search params; hasFilter: whether the filters filter (e.g. for the text of an empty grid)
    return { search, hasFilter: filter.items.length > 0, updateSearch, gridProps };
}

// The previous value as long as the new one is equal (JSON values)
function useStableValue<Value>(value: Value) {
    const [stableValue, setStableValue] = useState(value);
    if (JSON.stringify(value) !== JSON.stringify(stableValue)) {
        setStableValue(value);
        return value;
    }
    return stableValue;
}
