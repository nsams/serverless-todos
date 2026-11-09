import { linkOptions, useNavigate } from "@tanstack/react-router";
import { parseResponse } from "hono/client";

import { api } from "~/api/client";
import { NavigationList } from "~/components/NavigationList";

import { maxListNameLength } from "../limits";
import { useLists } from "../navigation";

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const lists = useLists();
    const navigate = useNavigate();

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
                const response = await api.lists.$post({ json: { name } });
                if (response.status === 422) {
                    return (await response.json()).error;
                }
                const { id } = await parseResponse(response);
                await navigate({ to: "/lists/$listId", params: { listId: id } });
                return null;
            }}
            onNavigate={onNavigate}
        />
    );
}
