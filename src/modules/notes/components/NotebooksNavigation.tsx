import { useCreateCollection } from "~/collections";
import { NavigationList } from "~/components/NavigationList";

import { notesApi, type NotesApiOutputs } from "../api";
import { maxNotebookNameLength } from "../limits";
import { notesModuleId } from "../moduleId";
import { notebookRoute } from "../routes";

// The user's notebooks in the app's sidebar (navigation.ts)
export function NotebooksNavigation({ data: notebooks, onNavigate }: { data: NotesApiOutputs["listNotebooks"]; onNavigate: () => void }) {
    const createNotebook = useCreateCollection(
        notesModuleId,
        (name) => notesApi.createNotebook.mutate({ name }),
        (notebookId) => notebookRoute.href({ notebookId }),
    );

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
            onCreate={createNotebook}
            onNavigate={onNavigate}
        />
    );
}
