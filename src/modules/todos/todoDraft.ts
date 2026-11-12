import { defineDraft } from "~/drafts/draft";

import { todosModuleId } from "./moduleId";

// The shared draft of a todo (live editing of the todo form, src/drafts/): everyone who has the todo's form open and the AI assistants
// edit the same draft; the todo only changes when it is published. Server part: todoDrafts in operations.server.ts.

// The form's fields: the editable fields of a todo
export type TodoDraftValues = {
    title: string;
    description: string;
    // YYYY-MM-DD, null: no due date
    dueDate: string | null;
    done: boolean;
    listId: string;
};

export const todoDraft = defineDraft<TodoDraftValues>()({
    name: "todo",
    fields: { title: "text", description: "text", dueDate: "value", done: "value", listId: "value" },
});

// The WebSocket route of the form to the draft (api.server.ts)
export function todoDraftPath(id: string) {
    return `/api/${todosModuleId}/todos/${encodeURIComponent(id)}/draft`;
}
