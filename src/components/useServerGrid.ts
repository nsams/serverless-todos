import { type DataGridProProps, type GridFilterModel, GridLogicOperator, type GridSortModel, type GridValidRowModel } from "@mui/x-data-grid-pro";
import { useEffect } from "react";
import { useNavigate } from "react-router";

import { type GridFields, type GridSearch, lastPageWithRows, pageSizeOptions, parseGridSearch, serializeFilterValue } from "~/gridSearch";
import { stringifySearch } from "~/searchParams";

import { useStableValue } from "./useStableValue";

type Options<Row extends GridValidRowModel, Search extends GridSearch, Fields extends GridFields> = {
    // the page's search params (its route's useSearch): the current ones, also while the rows for them are loading
    search: Search;
    // the sortable and filterable fields
    fields: Fields;
    // the rows of the page and the number of rows on the server (with the filters applied)
    rows: Row[];
    rowCount: number;
    // the rows for the search params are loading (the grid shows the previous ones meanwhile, see usePageQuery)
    loading: boolean;
    // fields with calendar date filters (YYYY-MM-DD), e.g. a due date
    dateOnlyFields?: (keyof Fields & string)[];
};

// A DataGrid with server-side pagination, sorting and filtering whose state lives in the URL (see src/gridSearch.ts):
// gridProps connect the grid to the URL, the page's query loads the rows for it from the API (parseGridSearch on the server).
// The grid's state is the URL's right away, also while its rows are loading (e.g. a filter value while typing).
export function useServerGrid<Row extends GridValidRowModel, Search extends GridSearch, Fields extends GridFields>({
    search,
    fields,
    rows,
    rowCount,
    loading,
    dateOnlyFields = [],
}: Options<Row, Search, Fields>) {
    const navigate = useNavigate();
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

    // The page is empty, but there are rows on earlier pages (e.g. after deleting the last row of the last page): go to the last page with rows
    const lastPage = loading ? undefined : lastPageWithRows({ page, pageSize }, rows.length, rowCount);
    useEffect(() => {
        if (lastPage !== undefined) {
            navigateToSearch({ ...search, page: lastPage || undefined }, { replace: true });
        }
        // once per empty page (navigateToSearch and search are new on every render)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastPage]);

    // Changes search params, e.g. a search field next to the grid (also goes back to the first page)
    const updateSearch = (values: Partial<Search>, { replace = false } = {}) =>
        navigateToSearch({ ...search, page: undefined, ...values }, { replace });

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

    // hasFilter: whether the filters filter (e.g. for the text of an empty grid)
    return { hasFilter: filter.items.length > 0, updateSearch, gridProps };
}
