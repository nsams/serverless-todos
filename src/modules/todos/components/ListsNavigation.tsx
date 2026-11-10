import { useNavigate } from "react-router";

import { NavigationList } from "~/components/NavigationList";
import { useRevalidateModule } from "~/moduleData";

import { todosApi, type TodosApiOutputs } from "../api";
import { maxListNameLength } from "../limits";
import { todosModuleId } from "../moduleId";
import { listRoute } from "../routes";

// The user's lists in the app's sidebar (navigation.ts)
export function ListsNavigation({ data: lists, onNavigate }: { data: TodosApiOutputs["listLists"]; onNavigate: () => void }) {
    const navigate = useNavigate();
    const revalidate = useRevalidateModule(todosModuleId);

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
            onCreate={async (name) => {
                const list = await todosApi.createList.mutate({ name });
                await navigate(listRoute.href({ listId: list.id }));
                void revalidate();
            }}
            onNavigate={onNavigate}
        />
    );
}
