import { href, useNavigate } from "react-router";

import { NavigationList } from "~/components/NavigationList";

import { useNotebooks, useNoteOperations } from "../client";
import { maxNotebookNameLength } from "../limits";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const notebooks = useNotebooks();
    const { run } = useNoteOperations();
    const navigate = useNavigate();

    return (
        <NavigationList
            items={notebooks.map((notebook) => ({
                id: notebook.id,
                name: notebook.name,
                to: href("/notes/:notebookId", { notebookId: notebook.id }),
                count: notebook.noteCount,
                countLabel: `${notebook.noteCount} notes`,
            }))}
            createLabel="New notebook"
            maxNameLength={maxNotebookNameLength}
            onCreate={async (name) => {
                const notebook = await run("createNotebook", { name });
                await navigate(href("/notes/:notebookId", { notebookId: notebook.id }));
            }}
            onNavigate={onNavigate}
        />
    );
}
