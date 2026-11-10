import { useCreateCollection } from "~/collections";
import { NavigationList } from "~/components/NavigationList";

import { todosApi, type TodosApiOutputs } from "../api";
import { maxListNameLength } from "../limits";
import { todosModuleId } from "../moduleId";
import { listRoute } from "../routes";

// The user's lists in the app's sidebar (navigation.ts)
export function ListsNavigation({ data: lists, onNavigate }: { data: TodosApiOutputs["listLists"]; onNavigate: () => void }) {
    const createList = useCreateCollection(
        todosModuleId,
        (name) => todosApi.createList.mutate({ name }),
        (listId) => listRoute.href({ listId }),
    );

    return (
        <NavigationList
            items={lists.map((list) => ({
                id: list.id,
                name: list.name,
                path: listRoute.href({ listId: list.id }),
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
