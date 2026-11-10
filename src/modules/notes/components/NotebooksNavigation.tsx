import { parseResponse } from "hono/client";

import { useModuleRevalidator } from "~/client/routing";
import { NavigationList } from "~/components/NavigationList";

import { notesClient } from "../api";
import { maxNotebookNameLength } from "../limits";
import { notesModuleId } from "../moduleId";
import { useNotebooks } from "../navigation";
import { notebookRoute } from "../routes";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const notebooks = useNotebooks();
    const { navigate } = useModuleRevalidator(notesModuleId);

    return (
        <NavigationList
            items={notebooks.map((notebook) => ({
                id: notebook.id,
                name: notebook.name,
                link: notebookRoute.href({ notebookId: notebook.id }),
                count: notebook.noteCount,
                countLabel: `${notebook.noteCount} notes`,
            }))}
            createLabel="New notebook"
            maxNameLength={maxNotebookNameLength}
            onCreate={async (name) => {
                const notebook = await parseResponse(notesClient.notebooks.$post({ json: { name } }));
                // also shows the new notebook in the sidebar
                await navigate(notebookRoute.href({ notebookId: notebook.id }));
            }}
            onNavigate={onNavigate}
        />
    );
}
