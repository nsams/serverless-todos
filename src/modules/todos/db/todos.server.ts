import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or, type SQL, sql } from "drizzle-orm";

import { getDb } from "~/db/db.server";

import { getListRepository } from "./lists.server";
import { todos } from "./schema";

export type Todo = typeof todos.$inferSelect;

export type TodoSort = { field: "title" | "description" | "dueDate" | "done" | "createdAt"; direction: "asc" | "desc" };

type TextOperator = "contains" | "equals" | "startsWith" | "endsWith";

export type TodoFilter =
    | { field: "title"; operator: TextOperator; value: string }
    | { field: "description"; operator: TextOperator; value: string }
    | { field: "dueDate"; operator: "is" | "after" | "onOrAfter" | "before" | "onOrBefore"; value: string /* YYYY-MM-DD */ }
    | { field: "done"; operator: "is"; value: boolean }
    | { field: "createdAt"; operator: "after" | "onOrAfter" | "before" | "onOrBefore"; value: Date };

export type TodoFilterModel = { items: TodoFilter[]; logicOperator: "and" | "or" };

type ListOptions = { offset: number; limit: number; sort: TodoSort[]; filter: TodoFilterModel };

export type TodoValues = Pick<Todo, "title" | "description" | "dueDate">;

// Search across the user's lists (used by the chat assistant)
type SearchOptions = { listId?: string; done?: boolean; query?: string; limit: number };

type TodoRepository = {
    list(userId: string, listId: string, options: ListOptions): Promise<{ rows: Todo[]; totalCount: number }>;
    // open todos first, then by due date (todos without due date last), newest first
    search(userId: string, options: SearchOptions): Promise<Todo[]>;
    get(userId: string, id: string): Promise<Todo | undefined>;
    // false if the list doesn't exist (or belongs to another user)
    create(userId: string, listId: string, values: TodoValues): Promise<boolean>;
    // false if the target list doesn't exist (or belongs to another user)
    update(userId: string, id: string, values: Partial<TodoValues & Pick<Todo, "done" | "listId">>): Promise<boolean>;
    delete(userId: string, id: string): Promise<void>;
};

export function getTodoRepository(): TodoRepository {
    const db = getDb();
    const listExists = async (userId: string, listId: string) => (await getListRepository().get(userId, listId)) !== undefined;
    return {
        list: async (userId, listId, { offset, limit, sort, filter }) => {
            const filterConditions = filter.items.map((item) => filterCondition(item));
            const where = and(
                eq(todos.userId, userId),
                eq(todos.listId, listId),
                filter.logicOperator === "or" ? or(...filterConditions) : and(...filterConditions),
            );
            const orderBy = sort.flatMap(({ field, direction }) => {
                const order = direction === "asc" ? asc : desc;
                if (field === "title" || field === "description") {
                    // case-insensitive (SQLite compares binary by default)
                    return [order(sql`lower(${todos[field]})`)];
                }
                if (field === "dueDate") {
                    // todos without due date last in both directions
                    return [asc(isNull(todos.dueDate)), order(todos.dueDate)];
                }
                return [order(todos[field])];
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
        create: async (userId, listId, values) => {
            if (!(await listExists(userId, listId))) {
                return false;
            }
            await db.insert(todos).values({ userId, listId, ...values });
            return true;
        },
        update: async (userId, id, values) => {
            if (values.listId !== undefined && !(await listExists(userId, values.listId))) {
                return false;
            }
            await db
                .update(todos)
                .set(values)
                .where(and(eq(todos.id, id), eq(todos.userId, userId)));
            return true;
        },
        delete: async (userId, id) => {
            await db.delete(todos).where(and(eq(todos.id, id), eq(todos.userId, userId)));
        },
    };
}

function filterCondition(filter: TodoFilter): SQL | undefined {
    switch (filter.field) {
        case "title":
        case "description": {
            // case-insensitive (no ILIKE in SQLite), wildcards in the value are matched literally
            const value = filter.value.toLowerCase().replace(/[\\%_]/g, "\\$&");
            const pattern = { contains: `%${value}%`, equals: value, startsWith: `${value}%`, endsWith: `%${value}` }[filter.operator];
            return sql`lower(${todos[filter.field]}) like ${pattern} escape '\\'`;
        }
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
        case "createdAt": {
            // minute precision, like the DataGrid's dateTime filter
            const minute = new Date(filter.value);
            minute.setSeconds(0, 0);
            const nextMinute = new Date(minute.getTime() + 60_000);
            return {
                after: gte(todos.createdAt, nextMinute),
                onOrAfter: gte(todos.createdAt, minute),
                before: lt(todos.createdAt, minute),
                onOrBefore: lt(todos.createdAt, nextMinute),
            }[filter.operator];
        }
    }
}
