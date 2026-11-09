import { useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { generatePath } from "react-router";

import { api } from "~/api/client";
import { DefaultRedirect } from "~/components/DefaultRedirect";
import type { AppPage } from "~/modules/types";

import { listPath, listsPath } from "./paths";
import { listsQuery } from "./queries";
import { ListPage } from "./routes/ListPage";

// The module's pages (see paths.ts)
export const todosPages: AppPage[] = [
    // the user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
    { path: listsPath, Component: FirstListRedirect },
    { path: listPath, Component: ListPage },
];

function FirstListRedirect() {
    const queryClient = useQueryClient();
    return (
        <DefaultRedirect
            load={async () => {
                const { id } = await parseResponse(api.lists.default.$post());
                // the list may have just been created
                void queryClient.invalidateQueries({ queryKey: listsQuery.queryKey });
                return generatePath(listPath, { listId: id });
            }}
        />
    );
}
