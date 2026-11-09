import { href } from "react-router";

import { NavigationList } from "~/components/NavigationList";
import { useIntents } from "~/components/useIntents";

import type { NotebooksIntents } from "../intents.server";
import { maxNotebookNameLength } from "../limits";
import { useNotebooks } from "../navigation";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const notebooks = useNotebooks();
    // the action of the index route /notes
    const { submit } = useIntents<NotebooksIntents>(`${href("/notes")}?index`);

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
            // goes to the new notebook
            onCreate={async (name) => (await submit("createNotebook", { name }))?.error ?? null}
            onNavigate={onNavigate}
        />
    );
}
