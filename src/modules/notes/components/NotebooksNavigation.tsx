import { parseResponse } from "hono/client";
import { generatePath, useNavigate } from "react-router";

import { api } from "~/api/client";
import { NavigationList } from "~/components/NavigationList";

import { maxNotebookNameLength } from "../limits";
import { useNotebooks } from "../navigation";
import { notebookPath } from "../paths";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const notebooks = useNotebooks();
    const navigate = useNavigate();

    return (
        <NavigationList
            items={notebooks.map((notebook) => ({
                id: notebook.id,
                name: notebook.name,
                link: generatePath(notebookPath, { notebookId: notebook.id }),
                count: notebook.noteCount,
                countLabel: `${notebook.noteCount} notes`,
            }))}
            createLabel="New notebook"
            maxNameLength={maxNotebookNameLength}
            onCreate={async (name) => {
                const response = await api.notebooks.$post({ json: { name } });
                if (response.status === 422) {
                    return (await response.json()).error;
                }
                const { id } = await parseResponse(response);
                await navigate(generatePath(notebookPath, { notebookId: id }));
                return null;
            }}
            onNavigate={onNavigate}
        />
    );
}
