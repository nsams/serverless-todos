import { useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { generatePath } from "react-router";

import { api } from "~/api/client";
import { DefaultRedirect } from "~/components/DefaultRedirect";
import type { AppPage } from "~/modules/types";

import { notebookPath, notebooksPath, notePath } from "./paths";
import { notebooksQuery } from "./queries";
import { NotebookPage } from "./routes/NotebookPage";
import { NotePage } from "./routes/NotePage";

// The module's pages (see paths.ts)
export const notesPages: AppPage[] = [
    // the user's first notebook (created if the user has none yet)
    { path: notebooksPath, Component: FirstNotebookRedirect },
    { path: notebookPath, Component: NotebookPage },
    { path: notePath, Component: NotePage },
];

function FirstNotebookRedirect() {
    const queryClient = useQueryClient();
    return (
        <DefaultRedirect
            load={async () => {
                const { id } = await parseResponse(api.notebooks.default.$post());
                // the notebook may have just been created
                void queryClient.invalidateQueries({ queryKey: notebooksQuery.queryKey });
                return generatePath(notebookPath, { notebookId: id });
            }}
        />
    );
}
