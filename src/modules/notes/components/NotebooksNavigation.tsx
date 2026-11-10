import { useSuspenseQuery } from "@tanstack/react-query";
import { linkOptions, useNavigate } from "@tanstack/react-router";

import { NavigationList } from "~/components/NavigationList";
import { useInvalidateModule } from "~/moduleQueries";

import { maxNotebookNameLength } from "../limits";
import { notesModuleId } from "../moduleId";
import { createNotebook } from "../notebooks.functions";
import { notebooksQuery } from "../queries";

// The user's notebooks in the app's sidebar
export function NotebooksNavigation({ onNavigate }: { onNavigate: () => void }) {
    const { data: notebooks } = useSuspenseQuery(notebooksQuery);
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
                const notebook = await createNotebook({ data: { name } });
                await navigate({ to: "/notes/$notebookId", params: { notebookId: notebook.id } });
                void invalidate();
            }}
            onNavigate={onNavigate}
        />
    );
}
