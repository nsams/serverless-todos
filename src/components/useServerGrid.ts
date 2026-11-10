import { type DataGridProProps, type GridFilterModel, GridLogicOperator, type GridSortModel, type GridValidRowModel } from "@mui/x-data-grid-pro";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { type GridFields, type GridSearch, lastPageWithRows, pageSizeOptions, parseGridSearch, serializeFilterValue } from "~/gridSearch";

type Options<Row extends GridValidRowModel, Search extends GridSearch, Fields extends GridFields> = {
    // the route's validateSearch
    validateSearch: (search: unknown) => Search;
    // the sortable and filterable fields
    fields: Fields;
    // changes the route's search params, e.g. with the route's useNavigate
    navigate: (search: Search, options: { replace: boolean }) => void;
    // the rows of the page and the number of rows on the server (with the filters applied)
    rows: Row[];
    rowCount: number;
    // fields with calendar date filters (YYYY-MM-DD), e.g. a due date
    dateOnlyFields?: (keyof Fields & string)[];
};

// A DataGrid with server-side pagination, sorting and filtering whose state lives in the URL (see src/gridSearch.ts):
// gridProps connect the grid to the URL, the route's loader loads the rows for it (parseGridSearch on the server).
export function useServerGrid<Row extends GridValidRowModel, Search extends GridSearch, Fields extends GridFields>({
    validateSearch,
    fields,
    navigate,
    rows,
    rowCount,
    dateOnlyFields = [],
}: Options<Row, Search, Fields>) {
    // Use the pending location while loading, otherwise the grid would show the old state until the loader is done (e.g. reset a filter value while typing)
    const search = validateSearch(useRouterState({ select: (state) => state.location.search }));
    const loading = useRouterState({ select: (state) => state.status === "pending" && state.location.href !== state.resolvedLocation?.href });
    const { page, pageSize, sort, filter, filterItems } = parseGridSearch(search, fields);

    // Stable references: the grid treats a new sort model object as a changed sort and goes back to the first page
    // (e.g. a grid opened on ?page=1 ended up on the first page)
    const sortModel: GridSortModel = useStableValue(sort.map(({ field, direction }) => ({ field, sort: direction })));
    const filterModel: GridFilterModel = useStableValue({
        items: filterItems.map((item, index) => ({ id: index, ...item })),
        logicOperator: filter.logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And,
    });
    const paginationModel = useStableValue({ page, pageSize });

    // The page is empty, but there are rows on earlier pages (e.g. after deleting the last row of the last page): go to the last page with rows
    const lastPage = loading ? undefined : lastPageWithRows({ page, pageSize }, rows.length, rowCount);
    useEffect(() => {
        if (lastPage !== undefined) {
            navigate({ ...search, page: lastPage || undefined }, { replace: true });
        }
        // once per empty page (navigate and search are new on every render)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastPage]);

    // Changes search params, e.g. a search field next to the grid (also goes back to the first page)
    const updateSearch = (values: Partial<Search>, { replace = false } = {}) => navigate({ ...search, page: undefined, ...values }, { replace });

    const gridProps = {
        pagination: true,
        paginationMode: "server",
        sortingMode: "server",
        filterMode: "server",
        rows,
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
