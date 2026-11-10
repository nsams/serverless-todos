import { useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { NavigationList } from "~/components/NavigationList";

import { todosClient } from "../api";
import { maxListNameLength } from "../limits";
import { todosModuleId } from "../moduleId";
import { todosQuery, useLists } from "../queries";
import { listRoute } from "../routes";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const lists = useLists();
    const queryClient = useQueryClient();

    return (
        <NavigationList
            moduleId={todosModuleId}
            items={lists.map((list) => ({
                id: list.id,
                name: list.name,
                link: listRoute.href({ listId: list.id }),
                count: list.openCount,
                countLabel: `${list.openCount} open`,
                // the list's first page of todos, as the list's page loads it (no search params)
                prefetch: () => void queryClient.prefetchQuery(todosQuery({ listId: list.id })),
            }))}
            createLabel="New list"
            maxNameLength={maxListNameLength}
            onCreate={async (name) => {
                const list = await parseResponse(todosClient.lists.$post({ json: { name } }));
                return listRoute.href({ listId: list.id });
            }}
            onNavigate={onNavigate}
        />
    );
}
