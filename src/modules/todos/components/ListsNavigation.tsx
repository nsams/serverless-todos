import { linkOptions, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { NavigationList } from "~/components/NavigationList";

import { maxListNameLength } from "../limits";
import { createList } from "../lists.functions";
import { useLists } from "../navigation";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const lists = useLists();
    const navigate = useNavigate();
    const createListFn = useServerFn(createList);

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
                const list = await createListFn({ data: { name } });
                await navigate({ to: "/lists/$listId", params: { listId: list.id } });
            }}
            onNavigate={onNavigate}
        />
    );
}
