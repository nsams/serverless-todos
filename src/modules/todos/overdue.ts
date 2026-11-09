// Whether a todo is overdue depends on the user's local date (see useToday in src/dates.ts), so it is decided in the browser
export function isOverdue(todo: { dueDate: string | null; done: boolean }, today: string | null) {
    return today !== null && !todo.done && todo.dueDate !== null && todo.dueDate < today;
}
