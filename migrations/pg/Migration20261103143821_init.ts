import { Migration } from "@mikro-orm/migrations";

export class Migration20261103143821_init extends Migration {
    override name = "Migration20261103143821_init";

    // "if not exists": the table may already exist from the former drizzle-kit migration
    override up(): void | Promise<void> {
        this.addSql(
            `create table if not exists "todos" ("id" uuid not null, "user_id" text not null, "title" text not null, "done" boolean not null default false, "created_at" timestamptz not null, primary key ("id"));`,
        );
    }
}
