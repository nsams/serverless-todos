import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Helpers to run Wrangler from the scripts in this directory

// Runs Wrangler with output shown in the log, throws if it fails
export function wrangler(args: string[], env?: NodeJS.ProcessEnv) {
    execFileSync("npx", ["wrangler", ...args], { stdio: "inherit", env: { ...process.env, ...env } });
}

// Runs Wrangler with --json and returns the parsed output, throws if it fails
export function wranglerJson<T>(args: string[]): T {
    const stdout = execFileSync("npx", ["wrangler", ...args, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
    return JSON.parse(stdout) as T;
}

// Runs Wrangler and returns its exit code and combined output (for commands whose failure is an expected result)
export function wranglerResult(args: string[]) {
    const result = spawnSync("npx", ["wrangler", ...args], { encoding: "utf8" });
    return { ok: result.status === 0, output: `${result.stdout}\n${result.stderr}` };
}

export type D1Database = { uuid: string; name: string; created_at: string };

export function listD1Databases() {
    return wranglerJson<D1Database[]>(["d1", "list"]);
}

// Writes a Wrangler config with only the given database as binding `DB` and returns its path.
// Used for the D1 commands on a Preview database, as `wrangler d1 migrations apply` needs the database (and its migrations_dir) in the config.
export function writeD1Config(database: { name: string; uuid: string } | undefined) {
    const path = join(".wrangler", "preview", `${database?.name ?? "empty"}.json`);
    mkdirSync(dirname(path), { recursive: true });
    const config = {
        name: "serverless-todos",
        d1_databases: database
            ? [
                  {
                      binding: "DB",
                      database_name: database.name,
                      database_id: database.uuid,
                      // relative to this config file
                      migrations_dir: "../../drizzle",
                  },
              ]
            : [],
    };
    writeFileSync(path, JSON.stringify(config, null, 4));
    return path;
}
