import { parseResponse } from "hono/client";
import { generatePath, useNavigate } from "react-router";

import { NavigationList } from "~/components/NavigationList";

import { todosClient } from "../api";
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
                link: generatePath(listPath, { listId: list.id }),
                count: list.openCount,
                countLabel: `${list.openCount} open`,
            }))}
            createLabel="New list"
            maxNameLength={maxListNameLength}
            onCreate={async (name) => {
                const list = await parseResponse(todosClient.lists.$post({ json: { name } }));
                await navigate(generatePath(listPath, { listId: list.id }));
            }}
            onNavigate={onNavigate}
        />
    );
}
