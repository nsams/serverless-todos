import { and, desc, eq } from "drizzle-orm";

import { getDb } from "~/db/db.server";
import type { OperationContext } from "~/operations";

import type { HistoryAction, HistoryChanges, HistoryEntryView } from "./history";
import { history } from "./schema";

// The shared history (table `history`): an entity type's repository records every creation, change and deletion of its entities with
// the helpers of defineHistory. They return the INSERT, which the repository runs in one D1 batch with its own statement (a batch is
// atomic: no change without its entry). Who and where comes from the operation's context (user, source).

const entityTypes = new Set<string>();

type HistoryRow = typeof history.$inferSelect;

// An entity whose history is recorded: its id and the recorded fields
type Recorded<Entity extends { id: string }, Field extends keyof Entity> = Pick<Entity, "id" | Field>;

// The history of an entity type: its name (unique, stored with every entry) and the fields whose values are recorded, e.g.
//
//     const todoHistory = defineHistory<Todo>()("todo", ["title", "description", "dueDate", "done", "listId"]);
//
// (curried: the entity type is given, the fields are inferred)
export function defineHistory<Entity extends { id: string }>() {
    return <const Field extends keyof Entity & string>(entityType: string, fields: readonly Field[]) => {
        if (entityTypes.has(entityType)) {
            throw new Error(`History of ${entityType} is defined more than once`);
        }
        entityTypes.add(entityType);
        type Values = Pick<Entity, Field>;
        type Changes = HistoryChanges<Values>;

        const values = (entity: Recorded<Entity, Field>, key: "from" | "to"): Changes =>
            Object.fromEntries(fields.map((field) => [field, { [key]: entity[field] }])) as Changes;

        const insert = (ctx: OperationContext, entries: Array<{ entityId: string; action: HistoryAction; changes: Changes }>) =>
            getDb()
                .insert(history)
                .values(
                    entries.map(({ changes, ...entry }) => ({
                        ...entry,
                        changes: changes as HistoryRow["changes"],
                        userId: ctx.userId,
                        source: ctx.source,
                        entityType,
                    })),
                );

        return {
            // The entry of a created entity (its initial values)
            created: (ctx: OperationContext, entity: Recorded<Entity, Field>) =>
                insert(ctx, [{ entityId: entity.id, action: "created", changes: values(entity, "to") }]),
            // The entry of a change: the fields whose value changes (changes: the new values, undefined: unchanged); undefined if nothing
            // changes (then there's nothing to write either). `from` is the entity as read before: a concurrent change in between isn't
            // recorded as old value (D1 has no transactions across requests).
            updated: (ctx: OperationContext, entity: Recorded<Entity, Field>, changes: Partial<Values>) => {
                const changed = fields.filter((field) => changes[field] !== undefined && changes[field] !== entity[field]);
                if (changed.length === 0) {
                    return undefined;
                }
                const recorded = Object.fromEntries(changed.map((field) => [field, { from: entity[field], to: changes[field] }])) as Changes;
                return insert(ctx, [{ entityId: entity.id, action: "updated", changes: recorded }]);
            },
            // The entry of a deleted entity (its last values)
            deleted: (ctx: OperationContext, entity: Recorded<Entity, Field>) =>
                insert(ctx, [{ entityId: entity.id, action: "deleted", changes: values(entity, "from") }]),
            // The entries of several deleted entities, e.g. the todos of a deleted list; undefined if there are none
            deletedAll: (ctx: OperationContext, entities: Array<Recorded<Entity, Field>>) =>
                entities.length > 0
                    ? insert(
                          ctx,
                          entities.map((entity) => ({ entityId: entity.id, action: "deleted", changes: values(entity, "from") })),
                      )
                    : undefined,
            // An entity's history, newest entry first (also of a deleted entity); empty if there is none (or it belongs to another user)
            list: async (userId: string, entityId: string) => {
                const rows = await getDb()
                    .select()
                    .from(history)
                    .where(and(eq(history.entityType, entityType), eq(history.entityId, entityId), eq(history.userId, userId)))
                    .orderBy(desc(history.id));
                return rows.map((row) => historyEntryView<Values>(row));
            },
        };
    };
}

// What the UI and the model get to see of an entry (not the user, the entity type and id: known from the request)
function historyEntryView<Values>({ id, action, source, changes, createdAt }: HistoryRow) {
    return { id, action, source, changes: changes as HistoryChanges<Values>, createdAt } satisfies Omit<HistoryEntryView<Values>, "createdAt"> & {
        createdAt: Date;
    };
}
