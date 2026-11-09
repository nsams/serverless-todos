import { linkOptions } from "@tanstack/react-router";

import { api } from "~/api/client";
import { NavigationList } from "~/components/NavigationList";

import { maxNotebookNameLength } from "../limits";
import { useNotebooks } from "../navigation";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const notebooks = useNotebooks();

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
                const result = await api.notebooks.create.mutate({ name });
                return result.id === null
                    ? { error: result.error }
                    : { link: linkOptions({ to: "/notes/$notebookId", params: { notebookId: result.id } }) };
            }}
            onNavigate={onNavigate}
        />
    );
}
