import type { Kysely } from "kysely";

import type { MigrationContext } from "../scripts/migrate";

export async function up(db: Kysely<unknown>, { types }: MigrationContext) {
    await db.schema
        .createTable("todos")
        // `if not exists`: databases created by the previous Drizzle setup already have this table
        .ifNotExists()
        .addColumn("id", types.uuid, (col) => col.primaryKey().notNull())
        .addColumn("user_id", "text", (col) => col.notNull())
        .addColumn("title", "text", (col) => col.notNull())
        .addColumn("done", types.boolean, (col) => col.notNull().defaultTo(false))
        .addColumn("created_at", types.timestamp, (col) => col.notNull())
        .execute();
}
