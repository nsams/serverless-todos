-- Generated from migrations/0000_init.ts by `pnpm db:generate`, do not edit
create table if not exists "todos" ("id" text not null primary key, "user_id" text not null, "title" text not null, "done" integer default false not null, "created_at" integer not null);
