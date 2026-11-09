import { parseResponse } from "hono/client";
import { generatePath, useNavigate } from "react-router";

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
                link: generatePath(listPath, { listId: list.id }),
                count: list.openCount,
                countLabel: `${list.openCount} open`,
            }))}
            createLabel="New list"
            maxNameLength={maxListNameLength}
            onCreate={async (name) => {
                const response = await api.lists.$post({ json: { name } });
                if (response.status === 422) {
                    return (await response.json()).error;
                }
                const { id } = await parseResponse(response);
                await navigate(generatePath(listPath, { listId: id }));
                return null;
            }}
            onNavigate={onNavigate}
        />
    );
}
