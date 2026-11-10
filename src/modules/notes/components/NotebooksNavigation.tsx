import { parseResponse } from "hono/client";
import { generatePath, useNavigate } from "react-router";

import { NavigationList } from "~/components/NavigationList";

import { notesClient } from "../api";
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
                const notebook = await parseResponse(notesClient.notebooks.$post({ json: { name } }));
                await navigate(generatePath(notebookPath, { notebookId: notebook.id }));
            }}
            onNavigate={onNavigate}
        />
    );
}
