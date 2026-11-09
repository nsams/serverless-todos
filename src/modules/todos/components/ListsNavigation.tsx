import { href } from "react-router";

import { NavigationList } from "~/components/NavigationList";
import { useIntents } from "~/components/useIntents";

import type { ListsIntents } from "../intents.server";
import { maxListNameLength } from "../limits";
import { useLists } from "../navigation";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const lists = useLists();
    // the action of the index route /lists
    const { submit } = useIntents<ListsIntents>(`${href("/lists")}?index`);

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
            // goes to the new list
            onCreate={async (name) => (await submit("createList", { name }))?.error ?? null}
            onNavigate={onNavigate}
        />
    );
}
