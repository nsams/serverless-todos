import { useSuspenseQuery } from "@tanstack/react-query";
import { linkOptions, useNavigate } from "@tanstack/react-router";

import { NavigationList } from "~/components/NavigationList";
import { useInvalidateModule } from "~/moduleQueries";

import { maxListNameLength } from "../limits";
import { createList } from "../lists.functions";
import { todosModuleId } from "../moduleId";
import { listsQuery } from "../queries";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const { data: lists } = useSuspenseQuery(listsQuery);
    const navigate = useNavigate();
    const invalidate = useInvalidateModule(todosModuleId);

    return (
        <NavigationList
            items={lists.map((list) => ({
                id: list.id,
                name: list.name,
                link: linkOptions({ to: "/lists/$listId", params: { listId: list.id } }),
                count: list.openCount,
                countLabel: `${list.openCount} open`,
            }))}
            createLabel="New list"
            maxNameLength={maxListNameLength}
            onCreate={async (name) => {
                const list = await createList({ data: { name } });
                await navigate({ to: "/lists/$listId", params: { listId: list.id } });
                void invalidate();
            }}
            onNavigate={onNavigate}
        />
    );
}
