import { useSuspenseQuery } from "@tanstack/react-query";
import { linkOptions } from "@tanstack/react-router";
import { parseResponse } from "hono/client";

import { useCreateCollection } from "~/collections";
import { NavigationList } from "~/components/NavigationList";

import { notesClient } from "../api";
import { maxNotebookNameLength } from "../limits";
import { notesModuleId } from "../moduleId";
import { notebooksQuery } from "../queries";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const { data: notebooks } = useSuspenseQuery(notebooksQuery);
    const createNotebook = useCreateCollection(notesModuleId, (name) => parseResponse(notesClient.notebooks.$post({ json: { name } })), notebookLink);

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
