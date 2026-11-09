import { type DataGridProProps, type GridFilterModel, GridLogicOperator, type GridSortModel } from "@mui/x-data-grid-pro";
import { useLocation, useNavigate } from "react-router";

import { type GridFieldConfig, type GridSearch, pageSizeOptions, parseGridSearch, serializeFilterValue } from "~/gridSearch";
import { readSearch, stringifySearch } from "~/searchParams";

type Options<Search extends GridSearch> = {
    // the page's validateSearch
    validateSearch: (search: unknown) => Search;
    // the sortable and filterable fields
    fields: Record<string, GridFieldConfig>;
    // the number of rows on the server (with the filters applied)
    rowCount: number;
    // the rows for the current search params are loading (the grid shows the previous ones meanwhile, see placeholderData)
    loading: boolean;
    // fields with calendar date filters (YYYY-MM-DD), e.g. a due date
    dateOnlyFields?: string[];
};

// A DataGrid with server-side pagination, sorting and filtering whose state lives in the URL (see src/gridSearch.ts):
// gridProps connect the grid to the URL, the page's query loads the rows for the search params from the API (parseGridSearch on the server).
// The grid's state is the URL's right away, also while its rows are loading (e.g. a filter value while typing).
export function useServerGrid<Search extends GridSearch>({ validateSearch, fields, rowCount, loading, dateOnlyFields = [] }: Options<Search>) {
    const location = useLocation();
    const navigate = useNavigate();
    const search = readSearch(location.search, validateSearch);
    const { page, pageSize, sort, filter, filterItems } = parseGridSearch(search, fields);

    // Changes the page's search params; keeps the scroll position
    const navigateToSearch = (newSearch: Search, { replace }: { replace: boolean }) =>
        void navigate({ search: stringifySearch(newSearch) }, { replace, preventScrollReset: true });

    const sortModel: GridSortModel = sort.map(({ field, direction }) => ({ field, sort: direction }));
    const filterModel: GridFilterModel = {
        items: filterItems.map((item, index) => ({ id: index, ...item })),
        logicOperator: filter.logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And,
    };

    // Changes search params, e.g. a search field next to the grid (also goes back to the first page)
    const updateSearch = (values: Partial<Search>, { replace = false } = {}) =>
        navigateToSearch({ ...search, page: undefined, ...values }, { replace });

    const gridProps = {
        pagination: true,
        paginationMode: "server",
        sortingMode: "server",
        filterMode: "server",
        rowCount,
        loading,
        pageSizeOptions,
        paginationModel: { page, pageSize },
        onPaginationModelChange: (model) => navigateToSearch({ ...search, page: model.page, pageSize: model.pageSize }, { replace: false }),
        sortModel,
        onSortModelChange: (model) =>
            navigateToSearch({ ...search, page: undefined, sort: model.map((item) => `${item.field}:${item.sort}`) }, { replace: false }),
        filterModel,
        onFilterModelChange: (model) =>
            navigateToSearch(
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
