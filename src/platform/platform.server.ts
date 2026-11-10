import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

// The app runs on two platforms with the same code, only the server entry differs:
//
// - Cloudflare Workers (src/server.cloudflare.ts): D1, login via Cloudflare Access
// - Node (src/server.node.ts), e.g. in a container on bunny.net Magic Containers: libSQL (Bunny Database), login via OpenID Connect
//
// The entry registers its platform once (setPlatform) before it handles requests. The rest of the app only knows this interface.

// Drizzle over D1 or libSQL: both are SQLite with an async API
export type Database = BaseSQLiteDatabase<"async", unknown>;

export type Platform = {
    name: "cloudflare" | "node";
    // Cheap to call: returns a handle (D1 binding) or a client created once (libSQL)
    getDb(): Database;
    // A variable of the environment (Worker vars and secrets, process.env); undefined if not set or empty
    getEnv(name: string): string | undefined;
    // Where the logout button leads (a full page load)
    logoutPath: string;
};

let platform: Platform | undefined;

export function setPlatform(value: Platform) {
    platform = value;
}

export function getPlatform(): Platform {
    if (!platform) {
        throw new Error("No platform registered: the server entry calls setPlatform (src/server.cloudflare.ts, src/server.node.ts)");
    }
    return platform;
}

export function getEnv(name: string) {
    return getPlatform().getEnv(name);
}
