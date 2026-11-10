import { useSuspenseQuery } from "@tanstack/react-query";
import { linkOptions } from "@tanstack/react-router";
import { parseResponse } from "hono/client";

import { useCreateCollection } from "~/collections";
import { NavigationList } from "~/components/NavigationList";

import { todosClient } from "../api";
import { maxListNameLength } from "../limits";
import { todosModuleId } from "../moduleId";
import { listsQuery } from "../queries";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const { data: lists } = useSuspenseQuery(listsQuery);
    const createList = useCreateCollection(todosModuleId, (name) => parseResponse(todosClient.lists.$post({ json: { name } })), listLink);

    return (
        <NavigationList
            items={lists.map((list) => ({
                id: list.id,
                name: list.name,
                link: listLink(list.id),
                count: list.openCount,
                countLabel: `${list.openCount} open`,
            }))}
            createLabel="New list"
            maxNameLength={maxListNameLength}
            onCreate={createList}
            onNavigate={onNavigate}
        />
    );
}

function listLink(listId: string) {
    return linkOptions({ to: "/lists/$listId", params: { listId } });
}
