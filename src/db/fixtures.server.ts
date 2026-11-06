import type { DrizzleD1Database } from "drizzle-orm/d1";

import { toDateString } from "~/dates";

import { lists, todos } from "./schema";

// Sample data for Previews (and local development): created for every user who has no lists yet, if SEED_FIXTURES is "true".
// Users are only known when they sign in (Cloudflare Access), so the fixtures can't be inserted when the database is created.

type FixtureTodo = { title: string; description?: string; dueInDays?: number; done?: boolean };

const fixtures: { name: string; todos: FixtureTodo[] }[] = [
    {
        name: "Privat",
        todos: [
            { title: "Steuererklärung abgeben", description: "Belege sammeln\nLohnzettel ist schon da", dueInDays: -5 },
            { title: "Zahnarzttermin vereinbaren", dueInDays: -1 },
            { title: "Milch kaufen", dueInDays: 0 },
            { title: "Geburtstagsgeschenk für Anna", description: "Buch oder Konzertkarten?", dueInDays: 3 },
            { title: "Fahrrad reparieren", description: "Hinterreifen flicken" },
            { title: "Winterreifen montieren", dueInDays: -10, done: true },
        ],
    },
    {
        name: "Arbeit",
        todos: [
            { title: "Quartalsbericht schreiben", description: "Zahlen von Controlling anfragen", dueInDays: -2 },
            { title: "Code Review für PR #42", dueInDays: 1 },
            { title: "Präsentation vorbereiten", description: "Folien für das Kundenmeeting", dueInDays: 7 },
            { title: "Urlaubsantrag stellen", done: true },
        ],
    },
    {
        name: "Einkaufsliste",
        todos: [{ title: "Brot" }, { title: "Äpfel" }, { title: "Kaffee", done: true }],
    },
];

export async function seedFixtures(db: DrizzleD1Database, userId: string) {
    const now = Date.now();
    const listRows = fixtures.map((fixture, index) => ({
        id: crypto.randomUUID(),
        userId,
        name: fixture.name,
        // keeps the order of the lists
        createdAt: new Date(now + index),
    }));
    // one insert per list: D1 allows max. 100 bound parameters per query
    const todoRowsPerList = fixtures.map((fixture, listIndex) =>
        fixture.todos.map((todo, todoIndex) => ({
            userId,
            listId: listRows[listIndex].id,
            title: todo.title,
            description: todo.description ?? "",
            dueDate: todo.dueInDays === undefined ? null : toDateString(new Date(now + todo.dueInDays * 24 * 60 * 60 * 1000)),
            done: todo.done ?? false,
            // the grid shows the newest todos first (without sorting): keep the order of the fixtures
            createdAt: new Date(now - todoIndex * 60_000),
        })),
    );
    // one transaction
    await db.batch([db.insert(lists).values(listRows), ...todoRowsPerList.map((todoRows) => db.insert(todos).values(todoRows))]);
}
