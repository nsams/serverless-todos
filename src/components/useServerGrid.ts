import { type DataGridProProps, type GridFilterModel, GridLogicOperator, type GridSortModel } from "@mui/x-data-grid-pro";
import { useLocation, useNavigate, useNavigation } from "react-router";

import { type GridFieldConfig, type GridSearch, pageSizeOptions, parseGridSearch, serializeFilterValue } from "~/gridSearch";
import { parseSearch, stringifySearch } from "~/searchParams";

type Options<Search extends GridSearch> = {
    // the route's validateSearch
    validateSearch: (search: unknown) => Search;
    // the sortable and filterable fields
    fields: Record<string, GridFieldConfig>;
    // the number of rows on the server (with the filters applied)
    rowCount: number;
    // fields with calendar date filters (YYYY-MM-DD), e.g. a due date
    dateOnlyFields?: string[];
};

// A DataGrid with server-side pagination, sorting and filtering whose state lives in the URL (see src/gridSearch.ts):
// gridProps connect the grid to the URL, the route's loader loads the rows for it (parseGridSearch on the server).
export function useServerGrid<Search extends GridSearch>({ validateSearch, fields, rowCount, dateOnlyFields = [] }: Options<Search>) {
    const location = useLocation();
    const navigation = useNavigation();
    const routerNavigate = useNavigate();
    // A navigation to other search params of this page: use its location while loading, otherwise the grid would show the old state until
    // the loader is done (e.g. reset a filter value while typing)
    const pendingLocation = navigation.location?.pathname === location.pathname ? navigation.location : undefined;
    const search = validateSearch(parseSearch((pendingLocation ?? location).search));
    const loading = pendingLocation !== undefined && pendingLocation.search !== location.search;
    const { page, pageSize, sort, filter, filterItems } = parseGridSearch(search, fields);

    // changes the search params of this page (keeps the scroll position)
    const navigate = (newSearch: Search, { replace }: { replace: boolean }) =>
        void routerNavigate({ search: stringifySearch(newSearch) }, { replace, preventScrollReset: true });

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
