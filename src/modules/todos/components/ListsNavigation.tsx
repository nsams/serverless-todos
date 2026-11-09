import { useNavigate } from "react-router";

import { api } from "~/api/client";
import { NavigationList } from "~/components/NavigationList";

import { maxListNameLength } from "../limits";
import { useLists } from "../navigation";
import { listPath } from "../paths";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const lists = useLists();
    const navigate = useNavigate();

    return (
        <NavigationList
            items={lists.map((list) => ({
                id: list.id,
                name: list.name,
                path: listPath(list.id),
                count: list.openCount,
                countLabel: `${list.openCount} open`,
            }))}
            createLabel="New list"
            maxNameLength={maxListNameLength}
            onCreate={async (name) => {
                const result = await api.lists.create.mutate({ name });
                if (result.id !== null) {
                    await navigate(listPath(result.id));
                }
                return result.error;
            }}
            onNavigate={onNavigate}
        />
    );
}
