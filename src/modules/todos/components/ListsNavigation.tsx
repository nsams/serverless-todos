import { useNavigate } from "react-router";

import { api } from "~/api/client";
import { NavigationList } from "~/components/NavigationList";

import { maxListNameLength } from "../limits";
import { listRoute } from "../paths";
import { invalidateLists, useLists } from "../queries";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const lists = useLists() ?? [];
    const navigate = useNavigate();

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
                const result = await api.lists.create.mutate({ name });
                if (result.id !== null) {
                    await navigate(listRoute.href({ listId: result.id }));
                    // the new list in the sidebar
                    await invalidateLists();
                }
                return result.error;
            }}
            onNavigate={onNavigate}
        />
    );
}
