import { getPlatform } from "~/platform/platform.server";

// D1 on Cloudflare, libSQL (Bunny Database) on Node (src/platform/platform.server.ts)
export function getDb() {
    return getPlatform().getDb();
}
