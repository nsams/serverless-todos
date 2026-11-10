import { href, useNavigate } from "react-router";

import { NavigationList } from "~/components/NavigationList";

import { useLists, useTodoOperations } from "../client";
import { maxListNameLength } from "../limits";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const lists = useLists();
    const { run } = useTodoOperations();
    const navigate = useNavigate();

    return (
        <NavigationList
            items={lists.map((list) => ({
                id: list.id,
                name: list.name,
                to: href("/lists/:listId", { listId: list.id }),
                count: list.openCount,
                countLabel: `${list.openCount} open`,
            }))}
            createLabel="New list"
            maxNameLength={maxListNameLength}
            onCreate={async (name) => {
                const list = await run("createList", { name });
                await navigate(href("/lists/:listId", { listId: list.id }));
            }}
            onNavigate={onNavigate}
        />
    );
}
