import { type DataGridProProps, type GridFilterModel, GridLogicOperator, type GridSortModel } from "@mui/x-data-grid-pro";
import { useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { type GridFieldConfig, type GridSearch, pageSizeOptions, parseGridSearch, serializeFilterValue } from "~/gridSearch";
import { parseSearch } from "~/searchParams";

type Options<Search extends GridSearch> = {
    // the route's validateSearch
    validateSearch: (search: unknown) => Search;
    // the sortable and filterable fields
    fields: Record<string, GridFieldConfig>;
    // changes the route's search params, e.g. with the route's useNavigate
    navigate: (search: Search, options: { replace: boolean }) => void;
    // the number of rows on the server (with the filters applied)
    rowCount: number;
    // fields with calendar date filters (YYYY-MM-DD), e.g. a due date
    dateOnlyFields?: string[];
};

// A DataGrid with server-side pagination, sorting and filtering whose state lives in the URL (see src/gridSearch.ts):
// gridProps connect the grid to the URL, the route's loader loads the rows for it (loaderDeps: the search params; parseGridSearch on the server).
export function useServerGrid<Search extends GridSearch>({ validateSearch, fields, navigate, rowCount, dateOnlyFields = [] }: Options<Search>) {
    // The pending location while loading (a navigation to other search params waits for the route's loader), otherwise the grid would
    // show the old state until the loader is done (e.g. reset a filter value while typing)
    const searchStr = useRouterState({ select: (state) => state.location.searchStr });
    const loading = useRouterState({ select: (state) => state.status === "pending" && state.location.href !== state.resolvedLocation?.href });

    // Only new objects when the search params change: the grid takes a new sort or filter model (even with the same content) as a change
    // and goes back to the first page
    const { search, page, pageSize, sortModel, filterModel, hasFilter } = useMemo(() => {
        const search = validateSearch(parseSearch(searchStr));
        const { page, pageSize, sort, filter, filterItems } = parseGridSearch(search, fields);
        const sortModel: GridSortModel = sort.map(({ field, direction }) => ({ field, sort: direction }));
        const filterModel: GridFilterModel = {
            items: filterItems.map((item, index) => ({ id: index, ...item })),
            logicOperator: filter.logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And,
        };
        return { search, page, pageSize, sortModel, filterModel, hasFilter: filter.items.length > 0 };
    }, [searchStr, validateSearch, fields]);
    const paginationModel = useMemo(() => ({ page, pageSize }), [page, pageSize]);

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
        paginationModel,
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
    return { search, hasFilter, updateSearch, gridProps };
}
