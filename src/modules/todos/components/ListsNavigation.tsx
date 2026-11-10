import { parseResponse } from "hono/client";

import { NavigationList } from "~/components/NavigationList";

import { todosClient } from "../api";
import { maxListNameLength } from "../limits";
import { todosModuleId } from "../moduleId";
import { useLists } from "../queries";
import { listRoute } from "../routes";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const lists = useLists();

    return (
        <NavigationList
            moduleId={todosModuleId}
            items={lists.map((list) => ({
                id: list.id,
                name: list.name,
                link: listRoute.href({ listId: list.id }),
                count: list.openCount,
                countLabel: `${list.openCount} open`,
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
