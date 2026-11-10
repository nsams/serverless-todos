import { useSuspenseQuery } from "@tanstack/react-query";
import { linkOptions } from "@tanstack/react-router";

import { useCreateCollection } from "~/collections";
import { NavigationList } from "~/components/NavigationList";

import { notesApi } from "../api";
import { maxNotebookNameLength } from "../limits";
import { notesModuleId } from "../moduleId";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const { data: notebooks } = useSuspenseQuery(notesApi.listNotebooks.queryOptions({}));
    const createNotebook = useCreateCollection(notesModuleId, (name) => notesApi.createNotebook.mutate({ name }), notebookLink);

    return (
        <NavigationList
            items={notebooks.map((notebook) => ({
                id: notebook.id,
                name: notebook.name,
                link: notebookLink(notebook.id),
                count: notebook.noteCount,
                countLabel: `${notebook.noteCount} notes`,
            }))}
            createLabel="New notebook"
            maxNameLength={maxNotebookNameLength}
            onCreate={createNotebook}
            onNavigate={onNavigate}
        />
    );
}

function notebookLink(notebookId: string) {
    return linkOptions({ to: "/notes/$notebookId", params: { notebookId } });
}
