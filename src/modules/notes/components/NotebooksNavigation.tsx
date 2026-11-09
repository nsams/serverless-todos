import { linkOptions, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { NavigationList } from "~/components/NavigationList";

import { maxNotebookNameLength } from "../limits";
import { useNotebooks } from "../navigation";
import { createNotebook } from "../notebooks.functions";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const notebooks = useNotebooks();
    const navigate = useNavigate();
    const createNotebookFn = useServerFn(createNotebook);

    return (
        <NavigationList
            items={notebooks.map((notebook) => ({
                id: notebook.id,
                name: notebook.name,
                link: linkOptions({ to: "/notes/$notebookId", params: { notebookId: notebook.id } }),
                count: notebook.noteCount,
                countLabel: `${notebook.noteCount} notes`,
            }))}
            createLabel="New notebook"
            maxNameLength={maxNotebookNameLength}
            onCreate={async (name) => {
                const result = await createNotebookFn({ data: { name } });
                if (result.id !== null) {
                    await navigate({ to: "/notes/$notebookId", params: { notebookId: result.id } });
                }
                return result.error;
            }}
            onNavigate={onNavigate}
        />
    );
}
