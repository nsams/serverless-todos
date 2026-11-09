import { linkOptions } from "@tanstack/react-router";

import { api } from "~/api/client";
import { NavigationList } from "~/components/NavigationList";

import { maxListNameLength } from "../limits";
import { useLists } from "../navigation";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const lists = useLists();

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
                const result = await api.lists.create.mutate({ name });
                return result.id === null ? { error: result.error } : { link: linkOptions({ to: "/lists/$listId", params: { listId: result.id } }) };
            }}
            onNavigate={onNavigate}
        />
    );
}
