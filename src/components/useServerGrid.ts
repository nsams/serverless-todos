import { type DataGridProProps, type GridFilterModel, GridLogicOperator, type GridSortModel, type GridValidRowModel } from "@mui/x-data-grid-pro";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useNavigate } from "react-router";

import { type GridFields, type GridSearch, lastPageWithRows, pageSizeOptions, parseGridSearch, serializeFilterValue } from "~/gridSearch";
import { stringifySearch } from "~/searchParams";

type Options<Row extends GridValidRowModel, Search extends GridSearch, Fields extends GridFields> = {
    // the current search params (route.useSearch()); the page's query loads the rows for them
    search: Search;
    // the sortable and filterable fields
    fields: Fields;
    // the rows of the page and the number of rows on the server (with the filters applied)
    rows: Row[];
    rowCount: number;
    // fields with calendar date filters (YYYY-MM-DD), e.g. a due date
    dateOnlyFields?: (keyof Fields & string)[];
};

// A DataGrid with server-side pagination, sorting and filtering whose state lives in the URL (see src/gridSearch.ts):
// gridProps connect the grid to the URL, the page's query loads the rows for it (parseGridSearch on the server).
export function useServerGrid<Row extends GridValidRowModel, Search extends GridSearch, Fields extends GridFields>({
    search,
    fields,
    rows,
    rowCount,
    dateOnlyFields = [],
}: Options<Row, Search, Fields>) {
    const routerNavigate = useNavigate();
    // The page's query suspends while the rows for new search params are loading; the navigation is a transition, so the grid keeps
    // showing the previous rows meanwhile (with a loading indicator), but the new state right away (e.g. a filter value while typing)
    const [loading, startTransition] = useTransition();
    const [shownSearch, setShownSearch] = useOptimistic(search);
    const { page, pageSize, sort, filter, filterItems } = parseGridSearch(shownSearch, fields);

    // changes the search params of this page (keeps the scroll position)
    const navigate = (newSearch: Search, { replace }: { replace: boolean }) =>
        startTransition(() => {
            setShownSearch(newSearch);
            void routerNavigate({ search: stringifySearch(newSearch) }, { replace, preventScrollReset: true });
        });

    // e.g. after deleting the last row of the last page: go to the last page with rows
    const lastPage = loading ? undefined : lastPageWithRows({ page, pageSize }, rows.length, rowCount);
    useEffect(() => {
        if (lastPage !== undefined) {
            navigate({ ...shownSearch, page: lastPage || undefined }, { replace: true });
        }
        // only when another page is needed
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastPage]);

    // Stable references: the grid treats a new sort model object as a changed sort and goes back to the first page
    // (e.g. a grid opened on ?page=1 ended up on the first page)
    const sortModel: GridSortModel = useStableValue(sort.map(({ field, direction }) => ({ field, sort: direction })));
    const filterModel: GridFilterModel = useStableValue({
        items: filterItems.map((item, index) => ({ id: index, ...item })),
        logicOperator: filter.logicOperator === "or" ? GridLogicOperator.Or : GridLogicOperator.And,
    });
    // the last page with rows right away, the grid would go to the first page itself otherwise
    const paginationModel = useStableValue({ page: lastPage ?? page, pageSize });

    // Changes search params, e.g. a search field next to the grid (also goes back to the first page)
    const updateSearch = (values: Partial<Search>, { replace = false } = {}) => navigate({ ...shownSearch, page: undefined, ...values }, { replace });

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
        onPaginationModelChange: (model) => navigate({ ...shownSearch, page: model.page || undefined, pageSize: model.pageSize }, { replace: false }),
        sortModel,
        onSortModelChange: (model) =>
            navigate({ ...shownSearch, page: undefined, sort: model.map((item) => `${item.field}:${item.sort}`) }, { replace: false }),
        filterModel,
        onFilterModelChange: (model) =>
            navigate(
                {
                    ...shownSearch,
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

    // search: the search params shown (also while their rows are loading); hasFilter: whether the filters filter (e.g. for the text
    // of an empty grid)
    return { search: shownSearch, hasFilter: filter.items.length > 0, updateSearch, gridProps };
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
