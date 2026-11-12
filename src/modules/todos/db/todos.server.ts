import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or, type SQL, sql } from "drizzle-orm";

import { getDb } from "~/db/db.server";
import { dateTimeCondition, filterModelCondition, sortOrder, textCondition } from "~/db/filters.server";

import type { TodoFilter, TodoFilterModel, TodoSort } from "../todoSearch";
import { getListRepository } from "./lists.server";
import { todos } from "./schema";

export type Todo = typeof todos.$inferSelect;

type ListOptions = { offset: number; limit: number; sort: TodoSort[]; filter: TodoFilterModel };

export type TodoValues = Pick<Todo, "title" | "description" | "dueDate">;

// Search across the user's lists (used by the chat assistant)
type SearchOptions = { listId?: string; done?: boolean; query?: string; limit: number };

type TodoRepository = {
    list(userId: string, listId: string, options: ListOptions): Promise<{ rows: Todo[]; totalCount: number }>;
    // open todos first, then by due date (todos without due date last), newest first
    search(userId: string, options: SearchOptions): Promise<Todo[]>;
    get(userId: string, id: string): Promise<Todo | undefined>;
    // The ids of a list's todos (e.g. to notify their drafts when the list is deleted with them)
    idsOfList(userId: string, listId: string): Promise<string[]>;
    // undefined if the list doesn't exist (or belongs to another user)
    create(userId: string, listId: string, values: TodoValues): Promise<Todo | undefined>;
    // The updated todo; undefined if the todo or the target list doesn't exist (or belongs to another user)
    update(userId: string, id: string, values: Partial<TodoValues & Pick<Todo, "done" | "listId">>): Promise<Todo | undefined>;
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
        idsOfList: async (userId, listId) => {
            const rows = await db
                .select({ id: todos.id })
                .from(todos)
                .where(and(eq(todos.userId, userId), eq(todos.listId, listId)));
            return rows.map(({ id }) => id);
        },
        create: async (userId, listId, values) => {
            if (!(await listExists(userId, listId))) {
                return undefined;
            }
            const [todo] = await db
                .insert(todos)
                .values({ userId, listId, ...values })
                .returning();
            return todo;
        },
        update: async (userId, id, values) => {
            if (values.listId !== undefined && !(await listExists(userId, values.listId))) {
                return undefined;
            }
            // nothing to change (an UPDATE needs at least one column)
            if (Object.values(values).every((value) => value === undefined)) {
                return repository.get(userId, id);
            }
            const [todo] = await db
                .update(todos)
                .set({ ...values, revision: sql`${todos.revision} + 1` })
                .where(and(eq(todos.id, id), eq(todos.userId, userId)))
                .returning();
            return todo;
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
