import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { NavigationList } from "~/components/NavigationList";

import { todosApi } from "../api";
import { maxListNameLength } from "../limits";
import { listRoute } from "../routes";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const { data: lists } = useSuspenseQuery(todosApi.listLists.queryOptions({}));
    const navigate = useNavigate();
    // opens the new list (the lists are reloaded afterwards)
    const createList = useMutation(todosApi.createList.mutationOptions({ onSuccess: ({ id }) => navigate(listRoute.href({ listId: id })) }));

    return (
        <NavigationList
            items={lists.map((list) => ({
                id: list.id,
                name: list.name,
                link: listRoute.link({ listId: list.id }),
                count: list.openCount,
                countLabel: `${list.openCount} open`,
            }))}
            createLabel="New list"
            maxNameLength={maxListNameLength}
            onCreate={async (name) => {
                await createList.mutateAsync({ name });
            }}
            onNavigate={onNavigate}
        />
    );
}
