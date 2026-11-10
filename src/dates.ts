import { useSyncExternalStore } from "react";
import { z } from "zod";

// Calendar dates without time zone (e.g. due dates), stored as YYYY-MM-DD

// Valid calendar date (rejects e.g. 2026-02-30)
export const dateStringSchema = z.iso.date();

export function isDateString(value: unknown): value is string {
    return dateStringSchema.safeParse(value).success;
}

// Local date of a Date as YYYY-MM-DD
export function toDateString(date: Date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

// YYYY-MM-DD as Date at local midnight
export function fromDateString(value: string) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function subscribeToDateChange(onChange: () => void) {
    // checked every minute, so e.g. the overdue marking updates after midnight
    const interval = setInterval(onChange, 60_000);
    return () => clearInterval(interval);
}

// The user's local date (YYYY-MM-DD); the server doesn't know the user's time zone
export function useToday() {
    return useSyncExternalStore(subscribeToDateChange, () => toDateString(new Date()));
}
