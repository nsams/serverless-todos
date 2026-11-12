import type { OperationSource } from "~/operations";

// The shared history (src/history/): who created, changed and deleted which entity when. Generic over the entity types (e.g. todos,
// defineHistory in history.server.ts); shared by the server and the app (no server code here).

export type HistoryAction = "created" | "updated" | "deleted";

// The recorded fields of an entry: created: the initial values (`to`); updated: the changed fields with old and new value (`from`, `to`);
// deleted: the last values (`from`). Values: the recorded fields of the entity type.
export type HistoryChanges<Values> = { [Field in keyof Values]?: { from?: Values[Field]; to?: Values[Field] } };

// An entry as the app gets it (dates as ISO strings in the JSON, see src/api/client.ts)
export type HistoryEntryView<Values> = {
    id: number;
    action: HistoryAction;
    // where the change was made; null: unknown (e.g. entities created before the history existed)
    source: OperationSource | null;
    changes: HistoryChanges<Values>;
    createdAt: string;
};
