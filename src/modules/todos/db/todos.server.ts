import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or, type SQL } from "drizzle-orm";

import { getDb } from "~/db/db.server";
import { dateTimeCondition, filterModelCondition, sortOrder, textCondition } from "~/db/filters.server";
import type { OperationSource } from "~/operations";

import type { TodoFilter, TodoFilterModel, TodoSort } from "../todoSearch";
import { getListRepository } from "./lists.server";
import { type TodoFieldChanges, todoHistory, type TodoHistoryValues, todos } from "./schema";

export type Todo = typeof todos.$inferSelect;

type ListOptions = { offset: number; limit: number; sort: TodoSort[]; filter: TodoFilterModel };

export type TodoValues = Pick<Todo, "title" | "description" | "dueDate">;

export type TodoHistoryEntry = typeof todoHistory.$inferSelect;

const historyFields = ["title", "description", "dueDate", "done", "listId"] as const satisfies Array<keyof TodoHistoryValues>;

// Search across the user's lists (used by the chat assistant)
type SearchOptions = { listId?: string; done?: boolean; query?: string; limit: number };

type TodoRepository = {
    list(userId: string, listId: string, options: ListOptions): Promise<{ rows: Todo[]; totalCount: number }>;
    // open todos first, then by due date (todos without due date last), newest first
    search(userId: string, options: SearchOptions): Promise<Todo[]>;
    get(userId: string, id: string): Promise<Todo | undefined>;
    // undefined if the list doesn't exist (or belongs to another user). Records the creation in the todo's history (source: where it was created).
    create(userId: string, listId: string, values: TodoValues, source: OperationSource): Promise<Todo | undefined>;
    // The updated todo; undefined if the todo or the target list doesn't exist (or belongs to another user). Only the fields whose value
    // changes are written, and recorded in the todo's history (nothing if nothing changes).
    update(
        userId: string,
        id: string,
        values: Partial<TodoValues & Pick<Todo, "done" | "listId">>,
        source: OperationSource,
    ): Promise<Todo | undefined>;
    // The todo's history, newest entry first (empty if the todo doesn't exist or belongs to another user)
    history(userId: string, id: string): Promise<TodoHistoryEntry[]>;
    // The deleted todo; undefined if it doesn't exist (or belongs to another user)
    delete(userId: string, id: string): Promise<Todo | undefined>;
};

export function getTodoRepository(): TodoRepository {
    const db = getDb();
    const listExists = async (userId: string, listId: string) => (await getListRepository().get(userId, listId)) !== undefined;
    const repository: TodoRepository = {
        list: async (userId, listId, { offset, limit, sort, filter }) => {
            const where = and(eq(todos.userId, userId), eq(todos.listId, listId), filterModelCondition(filter, filterCondition));
            const orderBy = sort.flatMap(({ field, direction }) => {
                if (field === "dueDate") {
                    // todos without due date last in both directions
                    return [asc(isNull(todos.dueDate)), sortOrder(todos.dueDate, direction)];
                }
                return [sortOrder(todos[field], direction, { caseInsensitive: field === "title" || field === "description" })];
            });
            const [rows, totalCount] = await Promise.all([
                db
                    .select()
                    .from(todos)
                    .where(where)
                    .orderBy(...orderBy, desc(todos.createdAt), desc(todos.id))
                    .limit(limit)
                    .offset(offset),
                db.$count(todos, where),
            ]);
            return { rows, totalCount };
        },
        search: async (userId, { listId, done, query, limit }) => {
            return db
                .select()
                .from(todos)
                .where(
                    and(
                        eq(todos.userId, userId),
                        listId !== undefined ? eq(todos.listId, listId) : undefined,
                        done !== undefined ? eq(todos.done, done) : undefined,
                        query
                            ? or(
                                  filterCondition({ field: "title", operator: "contains", value: query }),
                                  filterCondition({ field: "description", operator: "contains", value: query }),
                              )
                            : undefined,
                    ),
                )
                .orderBy(asc(todos.done), asc(isNull(todos.dueDate)), asc(todos.dueDate), desc(todos.createdAt), desc(todos.id))
                .limit(limit);
        },
        get: async (userId, id) => {
            return db
                .select()
                .from(todos)
                .where(and(eq(todos.id, id), eq(todos.userId, userId)))
                .get();
        },
        create: async (userId, listId, values, source) => {
            if (!(await listExists(userId, listId))) {
                return undefined;
            }
            const id = crypto.randomUUID();
            const createdAt = new Date();
            const changes: TodoFieldChanges = {
                title: { to: values.title },
                description: { to: values.description },
                dueDate: { to: values.dueDate },
                done: { to: false },
                listId: { to: listId },
            };
            // a batch is atomic: the todo isn't created without its history entry
            const [[todo]] = await db.batch([
                db
                    .insert(todos)
                    .values({ id, userId, listId, ...values, createdAt })
                    .returning(),
                db.insert(todoHistory).values({ userId, todoId: id, action: "created", source, changes, createdAt }),
            ]);
            return todo;
        },
        update: async (userId, id, values, source) => {
            if (values.listId !== undefined && !(await listExists(userId, values.listId))) {
                return undefined;
            }
            const current = await repository.get(userId, id);
            if (!current) {
                return undefined;
            }
            // the fields whose value changes (the history's "from" is the value read above: a concurrent change in between isn't
            // recorded as the old value, D1 has no transactions across requests)
            const changes: TodoFieldChanges = {};
            const set: Partial<TodoHistoryValues> = {};
            for (const field of historyFields) {
                const value = values[field];
                if (value !== undefined && value !== current[field]) {
                    Object.assign(changes, { [field]: { from: current[field], to: value } });
                    Object.assign(set, { [field]: value });
                }
            }
            // nothing to change (an UPDATE needs at least one column, and there's nothing to record)
            if (Object.keys(set).length === 0) {
                return current;
            }
            // a batch is atomic: the change isn't written without its history entry
            const [[todo]] = await db.batch([
                db
                    .update(todos)
                    .set(set)
                    .where(and(eq(todos.id, id), eq(todos.userId, userId)))
                    .returning(),
                db.insert(todoHistory).values({ userId, todoId: id, action: "updated", source, changes }),
            ]);
            return todo;
        },
        history: async (userId, id) => {
            return db
                .select()
                .from(todoHistory)
                .where(and(eq(todoHistory.todoId, id), eq(todoHistory.userId, userId)))
                .orderBy(desc(todoHistory.id));
        },
        delete: async (userId, id) => {
            const [todo] = await db
                .delete(todos)
                .where(and(eq(todos.id, id), eq(todos.userId, userId)))
                .returning();
            return todo;
        },
    };
    return repository;
}

function filterCondition(filter: TodoFilter): SQL | undefined {
    switch (filter.field) {
        case "title":
        case "description":
            return textCondition(todos[filter.field], filter.operator, filter.value);
        case "dueDate":
            // YYYY-MM-DD strings compare like dates; todos without due date never match
            return {
                is: eq(todos.dueDate, filter.value),
                after: gt(todos.dueDate, filter.value),
                onOrAfter: gte(todos.dueDate, filter.value),
                before: lt(todos.dueDate, filter.value),
                onOrBefore: lte(todos.dueDate, filter.value),
            }[filter.operator];
        case "done":
            return eq(todos.done, filter.value);
        case "createdAt":
            return dateTimeCondition(todos.createdAt, filter.operator, filter.value);
    }
}
