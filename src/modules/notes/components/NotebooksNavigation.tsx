import { useSuspenseQuery } from "@tanstack/react-query";
import { linkOptions, useNavigate } from "@tanstack/react-router";

import { NavigationList } from "~/components/NavigationList";
import { useInvalidateModule } from "~/moduleQueries";

import { notesApi } from "../api";
import { maxNotebookNameLength } from "../limits";
import { notesModuleId } from "../moduleId";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const { data: notebooks } = useSuspenseQuery(notesApi.listNotebooks.queryOptions({}));
    const navigate = useNavigate();
    const invalidate = useInvalidateModule(notesModuleId);

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
                const notebook = await notesApi.createNotebook.mutate({ name });
                await invalidate(() => navigate({ to: "/notes/$notebookId", params: { notebookId: notebook.id } }));
            }}
            onNavigate={onNavigate}
        />
    );
}
