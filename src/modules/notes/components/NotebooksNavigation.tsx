import { useNavigate } from "react-router";

import { api } from "~/api/client";
import { NavigationList } from "~/components/NavigationList";

import { maxNotebookNameLength } from "../limits";
import { notebookRoute } from "../paths";
import { invalidateNotebooks, useNotebooks } from "../queries";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const notebooks = useNotebooks() ?? [];
    const navigate = useNavigate();

    return (
        <NavigationList
            items={notebooks.map((notebook) => ({
                id: notebook.id,
                name: notebook.name,
                path: notebookRoute.href({ notebookId: notebook.id }),
                count: notebook.noteCount,
                countLabel: `${notebook.noteCount} notes`,
            }))}
            createLabel="New notebook"
            maxNameLength={maxNotebookNameLength}
            onCreate={async (name) => {
                const result = await api.notebooks.create.mutate({ name });
                if (result.id !== null) {
                    await navigate(notebookRoute.href({ notebookId: result.id }));
                    // the new notebook in the sidebar
                    await invalidateNotebooks();
                }
                return result.error;
            }}
            onNavigate={onNavigate}
        />
    );
}
