import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or, type SQL } from "drizzle-orm";

import { getDb } from "~/db/db.server";
import { dateTimeCondition, filterModelCondition, sortOrder, textCondition } from "~/db/filters.server";
import type { OperationContext } from "~/operations";

import type { TodoFilter, TodoFilterModel, TodoSort } from "../todoSearch";
import { getListRepository } from "./lists.server";
import { todos } from "./schema";
import { todoHistory } from "./todoHistory.server";

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
    // The changing methods record the change in the todo's history (todoHistory.server.ts), ctx: the user and where the change is made.
    // undefined if the list doesn't exist (or belongs to another user)
    create(ctx: OperationContext, listId: string, values: TodoValues): Promise<Todo | undefined>;
    // The updated todo; undefined if the todo or the target list doesn't exist (or belongs to another user). Nothing is written if no
    // value changes.
    update(ctx: OperationContext, id: string, values: Partial<TodoValues & Pick<Todo, "done" | "listId">>): Promise<Todo | undefined>;
    // The deleted todo; undefined if it doesn't exist (or belongs to another user)
    delete(ctx: OperationContext, id: string): Promise<Todo | undefined>;
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
        create: async (ctx, listId, values) => {
            if (!(await listExists(ctx.userId, listId))) {
                return undefined;
            }
            const todo: Todo = { id: crypto.randomUUID(), userId: ctx.userId, listId, done: false, createdAt: new Date(), ...values };
            // a batch is atomic: the todo isn't created without its history entry
            const [[created]] = await db.batch([db.insert(todos).values(todo).returning(), todoHistory.created(ctx, todo)]);
            return created;
        },
        update: async (ctx, id, values) => {
            if (values.listId !== undefined && !(await listExists(ctx.userId, values.listId))) {
                return undefined;
            }
            const current = await repository.get(ctx.userId, id);
            if (!current) {
                return undefined;
            }
            const entry = todoHistory.updated(ctx, current, values);
            // nothing changes (all fields are recorded, so nothing to write either)
            if (!entry) {
                return current;
            }
            const [[todo]] = await db.batch([
                db
                    .update(todos)
                    .set(values)
                    .where(and(eq(todos.id, id), eq(todos.userId, ctx.userId)))
                    .returning(),
                entry,
            ]);
            return todo;
        },
        delete: async (ctx, id) => {
            // the last values for the history
            const current = await repository.get(ctx.userId, id);
            if (!current) {
                return undefined;
            }
            const [[todo]] = await db.batch([
                db
                    .delete(todos)
                    .where(and(eq(todos.id, id), eq(todos.userId, ctx.userId)))
                    .returning(),
                todoHistory.deleted(ctx, current),
            ]);
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
