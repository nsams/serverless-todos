import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The shared history of all entity types (see history.server.ts): one entry per creation, change and deletion of an entity.
// No foreign key: the entries outlive the entity (its deletion is an entry itself).
export const history = sqliteTable(
    "history",
    {
        // ascending: the order of the entries, also within the same millisecond
        id: integer().primaryKey({ autoIncrement: true }),
        userId: text().notNull(),
        // e.g. "todo" (defineHistory, unique per entity type)
        entityType: text().notNull(),
        entityId: text().notNull(),
        // HistoryAction (history.ts)
        action: text({ enum: ["created", "updated", "deleted"] }).notNull(),
        // where the change was made (OperationSource in src/operations.ts); null: unknown
        source: text({ enum: ["app", "chat", "mcp"] }),
        // HistoryChanges of the entity type's recorded fields (history.ts)
        changes: text({ mode: "json" }).$type<Record<string, { from?: unknown; to?: unknown }>>().notNull(),
        createdAt: integer({ mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => [index("history_entity_idx").on(table.entityType, table.entityId)],
);
