import { useQuery } from "@tanstack/react-query";

import { fromDateString } from "~/dates";
import { type HistoryFields, HistoryPanel } from "~/history/HistoryPanel";

import type { TodoHistoryValues } from "../db/todoHistory.server";
import { listsQuery, todoHistoryQuery } from "../queries";

// A todo's history (shared history, src/history/) on its detail page, also of a deleted todo
export function TodoHistory({ todoId }: { todoId: string }) {
    const lists = useQuery(listsQuery).data;
    const fields: HistoryFields<TodoHistoryValues> = {
        title: { label: "Title" },
        description: { label: "Description", long: true },
        dueDate: {
            label: "Due",
            format: (dueDate) => (dueDate === null ? "none" : fromDateString(dueDate).toLocaleDateString(undefined, { dateStyle: "medium" })),
        },
        // the list may have been deleted since (only another list than the todo's own: that one deletes the todo with it)
        listId: { label: "List", format: (listId) => (lists ? (lists.find((list) => list.id === listId)?.name ?? "a deleted list") : "…") },
        done: { label: "Status", format: (done) => (done ? "Done" : "Open") },
    };
    return <HistoryPanel query={todoHistoryQuery(todoId)} fields={fields} />;
}
