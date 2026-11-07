import { drizzle } from "drizzle-orm/sqlite-proxy";

import { lists, todos } from "../src/db/schema.ts";

// Test data for Worker Previews and local development (`npm run db:seed`): a few lists with todos for each given user.
// Due dates are relative to today, so there are always overdue, due and upcoming todos.

type NewList = typeof lists.$inferInsert;
type NewTodo = typeof todos.$inferInsert;

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

const dayInMs = 24 * 60 * 60 * 1000;

// YYYY-MM-DD (UTC) of today + days
function dateInDays(days: number, now: Date) {
    return new Date(now.getTime() + days * dayInMs).toISOString().slice(0, 10);
}

export function createFixtures(userId: string, now = new Date()): { lists: NewList[]; todos: NewTodo[] } {
    const result: { lists: NewList[]; todos: NewTodo[] } = { lists: [], todos: [] };
    // ascending createdAt, so lists and todos keep the order above (both are sorted by createdAt by default)
    let createdAt = now.getTime() - 60 * 60 * 1000;
    for (const fixtureList of fixtureLists) {
        const listId = crypto.randomUUID();
        result.lists.push({ id: listId, userId, name: fixtureList.name, createdAt: new Date(createdAt++) });
        for (const todo of fixtureList.todos) {
            result.todos.push({
                id: crypto.randomUUID(),
                userId,
                listId,
                title: todo.title,
                description: todo.description ?? "",
                dueDate: todo.dueInDays !== undefined ? dateInDays(todo.dueInDays, now) : null,
                done: todo.done ?? false,
                createdAt: new Date(createdAt++),
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
        if (fixtures.todos.length > 0) {
            statements.push(toPlainSql(db.insert(todos).values(fixtures.todos).toSQL()));
        }
    }
    return statements.join("\n");
}
