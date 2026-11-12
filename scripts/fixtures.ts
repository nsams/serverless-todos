import { drizzle } from "drizzle-orm/sqlite-proxy";

import { history } from "../src/history/schema.ts";
import { notebooks, notes } from "../src/modules/notes/db/schema.ts";
import { lists, todoEntityType, todos } from "../src/modules/todos/db/schema.ts";

// Test data for Worker Previews and local development (`npm run db:seed`): lists with todos and notebooks with notes for each given user.
// Due dates are relative to today, so there are always overdue, due and upcoming todos.

type FixtureList = { name: string; todos: Array<{ title: string; description?: string; dueInDays?: number; done?: boolean }> };

const fixtureLists: FixtureList[] = [
    {
        name: "Todos",
        todos: [
            { title: "Submit expense report", description: "Receipts are in the shared folder.", dueInDays: -3 },
            { title: "Call the dentist", dueInDays: -1 },
            { title: "Review pull requests", dueInDays: 0 },
            { title: "Book train tickets", description: "Vienna → Salzburg, return on Sunday.", dueInDays: 2 },
            { title: "Plan team offsite", description: "Collect date proposals\nFind a location\nAsk about dietary restrictions", dueInDays: 14 },
            { title: "Read 'Designing Data-Intensive Applications'" },
            { title: "Renew passport", dueInDays: -10, done: true },
            { title: "Water the plants", done: true },
        ],
    },
    {
        name: "Groceries",
        todos: [
            { title: "Milk" },
            { title: "Bread" },
            { title: "Coffee beans", description: "The light roast, not the espresso one." },
            { title: "Apples", done: true },
        ],
    },
    {
        name: "Empty list",
        todos: [],
    },
];

type FixtureNotebook = { name: string; notes: Array<{ title: string; body: string; updatedDaysAgo?: number }> };

const fixtureNotebooks: FixtureNotebook[] = [
    {
        name: "Notes",
        notes: [
            {
                title: "Team offsite",
                body: [
                    "## Ideas",
                    "",
                    "- Hiking in the Alps",
                    "- Cooking class",
                    "- Escape room",
                    "",
                    "## Open questions",
                    "",
                    "1. Budget per person?",
                    "2. One or two days?",
                    "",
                    "Ask **everyone** for dietary restrictions before booking.",
                ].join("\n"),
            },
            {
                title: "Meeting notes 1:1",
                body: [
                    "Discussed the roadmap for next quarter.",
                    "",
                    "### Action items",
                    "",
                    "- [ ] Write the proposal",
                    "- [ ] Schedule a follow-up",
                ].join("\n"),
                updatedDaysAgo: 3,
            },
            {
                title: "Useful links",
                body: "- [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)\n- [Drizzle ORM](https://orm.drizzle.team)",
                updatedDaysAgo: 20,
            },
            { title: "Empty note", body: "" },
        ],
    },
    {
        name: "Recipes",
        notes: [
            {
                title: "Pancakes",
                body: [
                    "## Ingredients",
                    "",
                    "- 200 g flour",
                    "- 2 eggs",
                    "- 300 ml milk",
                    "- a pinch of salt",
                    "",
                    "## Steps",
                    "",
                    "Whisk everything, rest 10 minutes, fry.",
                ].join("\n"),
            },
        ],
    },
];

const dayInMs = 24 * 60 * 60 * 1000;

// YYYY-MM-DD (UTC) of today + days
function dateInDays(days: number, now: Date) {
    return new Date(now.getTime() + days * dayInMs).toISOString().slice(0, 10);
}

export function createFixtures(userId: string, now = new Date()) {
    const result = {
        lists: [] as Array<typeof lists.$inferInsert>,
        todos: [] as Array<typeof todos.$inferInsert>,
        history: [] as Array<typeof history.$inferInsert>,
        notebooks: [] as Array<typeof notebooks.$inferInsert>,
        notes: [] as Array<typeof notes.$inferInsert>,
    };
    // ascending createdAt, so lists and todos keep the order above (sorted by createdAt by default); notes with updatedDaysAgo are older
    let createdAt = now.getTime() - 60 * 60 * 1000;
    for (const fixtureList of fixtureLists) {
        const listId = crypto.randomUUID();
        result.lists.push({ id: listId, userId, name: fixtureList.name, createdAt: new Date(createdAt++) });
        for (const todo of fixtureList.todos) {
            const values = {
                title: todo.title,
                description: todo.description ?? "",
                dueDate: todo.dueInDays !== undefined ? dateInDays(todo.dueInDays, now) : null,
                done: todo.done ?? false,
            };
            const todoId = crypto.randomUUID();
            const todoCreatedAt = new Date(createdAt++);
            result.todos.push({ id: todoId, userId, listId, ...values, createdAt: todoCreatedAt });
            // created in the app (done todos as if created done, the history has no separate change for it)
            result.history.push({
                userId,
                entityType: todoEntityType,
                entityId: todoId,
                action: "created",
                source: "app",
                changes: {
                    title: { to: values.title },
                    description: { to: values.description },
                    dueDate: { to: values.dueDate },
                    done: { to: values.done },
                    listId: { to: listId },
                },
                createdAt: todoCreatedAt,
            });
        }
    }
    for (const fixtureNotebook of fixtureNotebooks) {
        const notebookId = crypto.randomUUID();
        result.notebooks.push({ id: notebookId, userId, name: fixtureNotebook.name, createdAt: new Date(createdAt++) });
        for (const note of fixtureNotebook.notes) {
            const noteCreatedAt = createdAt++ - (note.updatedDaysAgo ?? 0) * dayInMs;
            result.notes.push({
                id: crypto.randomUUID(),
                userId,
                notebookId,
                title: note.title,
                body: note.body,
                createdAt: new Date(noteCreatedAt),
                updatedAt: new Date(noteCreatedAt),
            });
        }
    }
    return result;
}

// Only used to generate SQL, never executed. Same casing as src/db/db.server.ts (the overload without batch callback ignores `casing`).
const db = drizzle(
    async () => {
        throw new Error("not supported");
    },
    undefined,
    { casing: "snake_case" },
);

function sqlLiteral(value: unknown): string {
    if (value === null || value === undefined) {
        return "NULL";
    }
    if (typeof value === "number" || typeof value === "bigint") {
        return String(value);
    }
    if (typeof value === "string") {
        return `'${value.replaceAll("'", "''")}'`;
    }
    throw new Error(`Unsupported SQL parameter: ${String(value)}`);
}

// Inlines the parameters, as `wrangler d1 execute --file` only takes plain SQL. The generated statements contain no `?` other than the placeholders.
function toPlainSql(query: { sql: string; params: unknown[] }) {
    let index = 0;
    return `${query.sql.replace(/\?/g, () => sqlLiteral(query.params[index++]))};`;
}

// SQL inserting the fixtures for the given users (normalized like the user id in src/auth.server.ts)
export function createFixturesSql(emails: string[]) {
    const statements: string[] = [];
    for (const email of emails) {
        const fixtures = createFixtures(email.trim().toLowerCase());
        statements.push(toPlainSql(db.insert(lists).values(fixtures.lists).toSQL()));
        statements.push(toPlainSql(db.insert(todos).values(fixtures.todos).toSQL()));
        statements.push(toPlainSql(db.insert(history).values(fixtures.history).toSQL()));
        statements.push(toPlainSql(db.insert(notebooks).values(fixtures.notebooks).toSQL()));
        statements.push(toPlainSql(db.insert(notes).values(fixtures.notes).toSQL()));
    }
    return statements.join("\n");
}
