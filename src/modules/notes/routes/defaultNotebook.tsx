import { api } from "~/api/client";
import { RedirectTo } from "~/routing";

import { notebookRoute } from "../paths";
import { invalidateNotebooks } from "../queries";

// /notes: redirects to the user's first notebook (created if the user has none yet)
export function DefaultNotebookPage() {
    return (
        <RedirectTo
            to={async () => {
                const { id } = await api.notebooks.getDefault.mutate();
                // the notebook may have been created
                void invalidateNotebooks();
                return notebookRoute.href({ notebookId: id });
            }}
        />
    );
}
