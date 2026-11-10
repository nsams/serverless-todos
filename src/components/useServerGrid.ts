import { type DataGridProProps, type GridFilterModel, GridLogicOperator, type GridSortModel } from "@mui/x-data-grid-pro";
import { useState } from "react";
import { useLocation, useNavigate, useNavigation } from "react-router";

import { type GridFields, type GridSearch, pageSizeOptions, parseGridSearch, serializeFilterValue } from "~/gridSearch";
import { parseSearch, stringifySearch } from "~/searchParams";

type Options<Search extends GridSearch, Fields extends GridFields> = {
    // the page's validateSearch
    validateSearch: (search: unknown) => Search;
    // the sortable and filterable fields
    fields: Fields;
    // the number of rows on the server (with the filters applied)
    rowCount: number;
    // fields with calendar date filters (YYYY-MM-DD), e.g. a due date
    dateOnlyFields?: (keyof Fields & string)[];
};

// A DataGrid with server-side pagination, sorting and filtering whose state lives in the URL (see src/gridSearch.ts):
// gridProps connect the grid to the URL, the page's loader loads the rows for it from the API (parseGridSearch on the server).
export function useServerGrid<Search extends GridSearch, Fields extends GridFields>({
    validateSearch,
    fields,
    rowCount,
    dateOnlyFields = [],
}: Options<Search, Fields>) {
    const location = useLocation();
    const navigation = useNavigation();
    const navigate = useNavigate();
    // Use the pending location while loading, otherwise the grid would show the old state until the loader is done (e.g. reset a filter value while typing)
    const pendingLocation = navigation.location?.pathname === location.pathname ? navigation.location : location;
    const search = validateSearch(parseSearch(pendingLocation.search));
    const loading = navigation.state === "loading" && navigation.location.pathname === location.pathname;
    const { page, pageSize, sort, filter, filterItems } = parseGridSearch(search, fields);

    // Changes the page's search params; keeps the scroll position
    const navigateToSearch = (newSearch: Search, { replace }: { replace: boolean }) =>
        void navigate({ search: stringifySearch(newSearch) }, { replace, preventScrollReset: true });

    // Stable references: the grid treats a new sort model object as a changed sort and goes back to the first page
    // (e.g. a grid opened on ?page=1 ended up on the first page)
    const sortModel: GridSortModel = useStableValue(sort.map(({ field, direction }) => ({ field, sort: direction })));
    const filterModel: GridFilterModel = useStableValue({
        items: filterItems.map((item, index) => ({ id: index, ...item })),
        logicOperator: filter.logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And,
    });
    const paginationModel = useStableValue({ page, pageSize });

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
        paginationModel,
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

// The previous value as long as it is equal (as JSON) to the new one
function useStableValue<T>(value: T): T {
    const [stable, setStable] = useState(value);
    if (JSON.stringify(value) === JSON.stringify(stable)) {
        return stable;
    }
    setStable(value);
    return value;
}
