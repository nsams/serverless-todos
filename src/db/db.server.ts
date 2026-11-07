import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

// Cheap to create: the D1 binding is just a handle, no connection pool to manage
export function getDb() {
    return drizzle(env.DB, { casing: "snake_case" });
}
