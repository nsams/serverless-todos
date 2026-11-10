import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { NavigationList } from "~/components/NavigationList";

import { notesApi } from "../api";
import { maxNotebookNameLength } from "../limits";
import { notebookRoute } from "../routes";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const { data: notebooks } = useSuspenseQuery(notesApi.listNotebooks.queryOptions({}));
    const navigate = useNavigate();
    // opens the new notebook (the notebooks are reloaded afterwards)
    const createNotebook = useMutation(
        notesApi.createNotebook.mutationOptions({ onSuccess: ({ id }) => navigate(notebookRoute.href({ notebookId: id })) }),
    );

    return (
        <NavigationList
            items={notebooks.map((notebook) => ({
                id: notebook.id,
                name: notebook.name,
                link: notebookRoute.link({ notebookId: notebook.id }),
                count: notebook.noteCount,
                countLabel: `${notebook.noteCount} notes`,
            }))}
            createLabel="New notebook"
            maxNameLength={maxNotebookNameLength}
            onCreate={async (name) => {
                await createNotebook.mutateAsync({ name });
            }}
            onNavigate={onNavigate}
        />
    );
}
