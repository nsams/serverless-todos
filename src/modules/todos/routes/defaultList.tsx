import { api } from "~/api/client";
import { RedirectTo } from "~/routing";

import { listRoute } from "../paths";
import { invalidateLists } from "../queries";

// /lists: redirects to the user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export function DefaultListPage() {
    return (
        <RedirectTo
            to={async () => {
                const { id } = await api.lists.getDefault.mutate();
                // the list may have been created
                void invalidateLists();
                return listRoute.href({ listId: id });
            }}
        />
    );
}
