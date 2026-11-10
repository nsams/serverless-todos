import { useNavigate } from "react-router";

import { NavigationList } from "~/components/NavigationList";
import { useRevalidateModule } from "~/moduleData";

import { notesApi, type NotesApiOutputs } from "../api";
import { maxNotebookNameLength } from "../limits";
import { notesModuleId } from "../moduleId";
import { notebookRoute } from "../routes";

// The user's notebooks in the app's sidebar (navigation.ts)
export function NotebooksNavigation({ data: notebooks, onNavigate }: { data: NotesApiOutputs["listNotebooks"]; onNavigate: () => void }) {
    const navigate = useNavigate();
    const revalidate = useRevalidateModule(notesModuleId);

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
            onCreate={async (name) => {
                const notebook = await notesApi.createNotebook.mutate({ name });
                await navigate(notebookRoute.href({ notebookId: notebook.id }));
                void revalidate();
            }}
            onNavigate={onNavigate}
        />
    );
}
