import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createFixturesSql } from "./fixtures.ts";
import { type D1Database, listD1Databases, wrangler, wranglerJson, wranglerResult, writeD1Config } from "./wrangler.ts";

// Worker Previews with their own D1 database (see README "Preview deployments").
//
// node scripts/preview.ts deploy   Preview command of Workers Builds (`npm run preview:deploy`): creates the database of the current branch
//                                  (if it doesn't exist yet), applies the migrations, inserts the fixtures (once), builds and deploys the Preview
// node scripts/preview.ts cleanup  Deletes the databases of Previews that no longer exist (`npm run preview:cleanup`, also run on every deploy)

const databasePrefix = "serverless-todos-preview-";

// Databases younger than this are never deleted: their Preview may not have been created yet (the database is created first)
const cleanupGracePeriodMs = 60 * 60 * 1000;

// Metadata table in every Preview database: the branch (= Preview name) it belongs to, used by cleanup, and whether the fixtures were inserted.
// Not part of the Drizzle schema, so migrations don't touch it.
const metadataTable = "_preview";

function currentBranch() {
    // set by Workers Builds; otherwise (when run locally) the checked out branch, like `wrangler preview` does
    const branch = process.env.WORKERS_CI_BRANCH || execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
    if (!branch || branch === "HEAD") {
        throw new Error("Could not determine the git branch (set WORKERS_CI_BRANCH)");
    }
    return branch;
}

// D1 database name of a branch: readable slug plus a hash, as different branch names can have the same slug
function databaseName(branch: string) {
    const slug = branch
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32)
        .replace(/-+$/, "");
    const hash = createHash("sha256").update(branch).digest("hex").slice(0, 8);
    return `${databasePrefix}${slug ? `${slug}-` : ""}${hash}`;
}

function sqlString(value: string) {
    return `'${value.replaceAll("'", "''")}'`;
}

function fixtureUsers() {
    return (process.env.PREVIEW_FIXTURE_USERS ?? "")
        .split(/[\s,;]+/)
        .map((email) => email.trim())
        .filter(Boolean);
}

function findDatabase(name: string) {
    return listD1Databases().find((database) => database.name === name);
}

function deploy() {
    const branch = currentBranch();
    const name = databaseName(branch);
    console.info(`Preview "${branch}", database ${name}`);

    let database = findDatabase(name);
    if (!database) {
        console.info(`Creating database ${name}`);
        // --config: a config without databases, so Wrangler doesn't offer to add the new database to wrangler.jsonc
        wrangler(["d1", "create", name, "--config", writeD1Config(undefined)]);
        database = findDatabase(name);
        if (!database) {
            throw new Error(`Database ${name} not found after creating it`);
        }
    }
    const config = writeD1Config(database);

    wrangler([
        "d1",
        "execute",
        "DB",
        "--remote",
        "--config",
        config,
        "--command",
        `CREATE TABLE IF NOT EXISTS ${metadataTable} (branch TEXT NOT NULL, seeded INTEGER NOT NULL DEFAULT 0);` +
            ` INSERT INTO ${metadataTable} (branch) SELECT ${sqlString(branch)} WHERE NOT EXISTS (SELECT 1 FROM ${metadataTable});`,
    ]);

    // Like production (`npm run deploy`): applies the migrations not applied yet, so the database is kept between pushes to the branch
    wrangler(["d1", "migrations", "apply", "DB", "--remote", "--config", config]);

    const [{ results }] = wranglerJson<Array<{ results: Array<{ seeded: number }> }>>([
        "d1",
        "execute",
        "DB",
        "--remote",
        "--config",
        config,
        "--command",
        `SELECT seeded FROM ${metadataTable}`,
    ]);
    if (!results[0]?.seeded) {
        const users = fixtureUsers();
        if (users.length === 0) {
            console.warn("PREVIEW_FIXTURE_USERS is not set (Workers Builds → Settings → Build → Variables and secrets): no fixtures inserted");
        } else {
            console.info(`Inserting fixtures for ${users.join(", ")}`);
            const seedFile = join(".wrangler", "preview", `${name}-seed.sql`);
            mkdirSync(join(".wrangler", "preview"), { recursive: true });
            writeFileSync(seedFile, `${createFixturesSql(users)}\nUPDATE ${metadataTable} SET seeded = 1;\n`);
            wrangler(["d1", "execute", "DB", "--remote", "--config", config, "--file", seedFile]);
        }
    }

    // vite.config.ts adds the database to the `previews` config of the build output, which `wrangler preview` uses
    execFileSync("npm", ["run", "build"], {
        stdio: "inherit",
        env: { ...process.env, PREVIEW_D1_DATABASE_NAME: database.name, PREVIEW_D1_DATABASE_ID: database.uuid },
    });
    // The Preview name is the branch name (the default of `wrangler preview`), so Workers Builds deletes the Preview with the branch
    wrangler(["preview", "--name", branch]);

    cleanup();
}

type PreviewState = "exists" | "deleted" | "unknown";

function previewState(branch: string): PreviewState {
    // There's no command to look up a Preview, listing its secrets fails with "was not found" if it doesn't exist
    const { ok, output } = wranglerResult(["preview", "secret", "list", "--name", branch]);
    if (ok) {
        return "exists";
    }
    if (output.includes(`The Preview "${branch}" was not found`)) {
        return "deleted";
    }
    console.warn(output);
    return "unknown";
}

function databaseBranch(database: D1Database) {
    const [{ results }] = wranglerJson<Array<{ results: Array<{ branch: string }> }>>([
        "d1",
        "execute",
        "DB",
        "--remote",
        "--config",
        writeD1Config(database),
        "--command",
        `SELECT branch FROM ${metadataTable}`,
    ]);
    return results[0]?.branch;
}

// Deletes the databases of deleted Previews. Workers Builds deletes a Preview when its branch is deleted (e.g. by GitHub after merging the pull request).
// Never fails (it's run as part of deployments): when in doubt, a database is kept and deleted by a later run.
function cleanup() {
    try {
        const databases = listD1Databases().filter((database) => database.name.startsWith(databasePrefix));
        for (const database of databases) {
            try {
                if (Date.now() - new Date(database.created_at).getTime() < cleanupGracePeriodMs) {
                    continue;
                }
                const branch = databaseBranch(database);
                if (!branch) {
                    console.warn(`Cleanup: database ${database.name} has no branch in ${metadataTable}, kept`);
                    continue;
                }
                const state = previewState(branch);
                if (state === "deleted") {
                    console.info(`Cleanup: Preview "${branch}" no longer exists, deleting database ${database.name}`);
                    wrangler(["d1", "delete", database.name, "--skip-confirmation", "--config", writeD1Config(undefined)]);
                } else if (state === "unknown") {
                    console.warn(`Cleanup: couldn't check Preview "${branch}", database ${database.name} kept`);
                }
            } catch (error) {
                console.warn(`Cleanup: skipping database ${database.name}`, error);
            }
        }
    } catch (error) {
        console.warn("Cleanup of Preview databases failed", error);
    }
}

const command = process.argv[2];
if (command === "deploy") {
    deploy();
} else if (command === "cleanup") {
    cleanup();
} else {
    console.error("Usage: node scripts/preview.ts deploy|cleanup");
    process.exit(1);
}
