import { type DataGridProProps, type GridFilterModel, GridLogicOperator, type GridSortModel } from "@mui/x-data-grid-pro";
import { useEffect } from "react";
import { useNavigate } from "react-router";

import { type GridFieldConfig, type GridSearch, lastPageWithRows, pageSizeOptions, parseGridSearch, serializeFilterValue } from "~/gridSearch";
import { stringifySearch } from "~/searchParams";

type Options<Search extends GridSearch> = {
    // the current search params (useRouteSearch), the page's query loads the rows for them
    search: Search;
    // the sortable and filterable fields
    fields: Record<string, GridFieldConfig>;
    // the query's result: the number of rows on the page and on the server (with the filters applied); undefined before the first result
    result: { rowsOnPage: number; rowCount: number } | undefined;
    // the rows for the current search params are loading (the previous result is shown meanwhile: placeholderData: keepPreviousData)
    loading: boolean;
    // fields with calendar date filters (YYYY-MM-DD), e.g. a due date
    dateOnlyFields?: string[];
};

// A DataGrid with server-side pagination, sorting and filtering whose state lives in the URL (see src/gridSearch.ts):
// gridProps connect the grid to the URL, the page's query loads the rows for it (parseGridSearch on the server).
// The grid shows a new state (e.g. a filter value while typing) right away, with a loading indicator until its rows are loaded.
export function useServerGrid<Search extends GridSearch>({ search, fields, result, loading, dateOnlyFields = [] }: Options<Search>) {
    const routerNavigate = useNavigate();
    const { page, pageSize, sort, filter, filterItems } = parseGridSearch(search, fields);

    // changes the search params of this page
    const navigate = (newSearch: Search, { replace }: { replace: boolean }) =>
        void routerNavigate({ search: stringifySearch(newSearch) }, { replace });

    // e.g. after deleting the last row of the last page: go to the last page with rows
    const lastPage = result && !loading ? lastPageWithRows({ page, pageSize }, result.rowsOnPage, result.rowCount) : undefined;
    useEffect(() => {
        if (lastPage !== undefined) {
            navigate({ ...search, page: lastPage || undefined }, { replace: true });
        }
        // only when the result is in
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastPage]);

    const sortModel: GridSortModel = sort.map(({ field, direction }) => ({ field, sort: direction }));
    const filterModel: GridFilterModel = {
        items: filterItems.map((item, index) => ({ id: index, ...item })),
        logicOperator: filter.logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And,
    };

    // Changes search params, e.g. a search field next to the grid (also goes back to the first page)
    const updateSearch = (values: Partial<Search>, { replace = false } = {}) => navigate({ ...search, page: undefined, ...values }, { replace });

    const gridProps = {
        pagination: true,
        paginationMode: "server",
        sortingMode: "server",
        filterMode: "server",
        rowCount: result?.rowCount ?? 0,
        loading,
        pageSizeOptions,
        // the last page with rows right away, the grid would go to the first page itself otherwise
        paginationModel: { page: lastPage ?? page, pageSize },
        onPaginationModelChange: (model) => navigate({ ...search, page: model.page || undefined, pageSize: model.pageSize }, { replace: false }),
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
