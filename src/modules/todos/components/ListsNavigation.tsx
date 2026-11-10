import { useSuspenseQuery } from "@tanstack/react-query";
import { linkOptions } from "@tanstack/react-router";

import { useCreateCollection } from "~/collections";
import { NavigationList } from "~/components/NavigationList";

import { todosApi } from "../api";
import { maxListNameLength } from "../limits";
import { todosModuleId } from "../moduleId";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const { data: lists } = useSuspenseQuery(todosApi.listLists.queryOptions({}));
    const createList = useCreateCollection(todosModuleId, (name) => todosApi.createList.mutate({ name }), listLink);

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
