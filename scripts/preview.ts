import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createFixturesSql } from "./fixtures.ts";
import { type D1Database, listD1Databases, workerName, wrangler, wranglerJson, wranglerResult, writeD1Config } from "./wrangler.ts";

// Worker Previews with their own D1 database (see README "Preview deployments").
//
// node scripts/preview.ts deploy   Preview command of Workers Builds (`npm run preview:deploy`): creates the database of the current branch
//                                  (if it doesn't exist yet), applies the migrations, inserts the fixtures (once), builds and deploys the Preview
// node scripts/preview.ts cleanup  Deletes the databases of deleted Previews, and Previews (with their database) not deployed for PREVIEW_TTL_DAYS
//                                  (`npm run preview:cleanup`, also run on every deploy)

const databasePrefix = "serverless-todos-preview-";

// Databases younger than this are never deleted: their Preview may not have been created yet (the database is created first)
const cleanupGracePeriodMs = 60 * 60 * 1000;

const dayInMs = 24 * 60 * 60 * 1000;

// Previews not deployed for this many days are deleted with their database (safety net for branches that are never deleted).
// A later push to the branch creates them again (with a new database).
const ttlDays = Number(process.env.PREVIEW_TTL_DAYS || 30);

// Metadata table in every Preview database: the branch (= Preview name) it belongs to, whether the fixtures were inserted
// and when the Preview was last deployed (ms), used by cleanup. Not part of the Drizzle schema, so migrations don't touch it.
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

function executeOnDatabase(config: string, sql: string) {
    wrangler(["d1", "execute", "DB", "--remote", "--config", config, "--command", sql]);
}

function queryDatabase<T>(config: string, sql: string): T[] {
    const [{ results }] = wranglerJson<Array<{ results: T[] }>>(["d1", "execute", "DB", "--remote", "--config", config, "--command", sql]);
    return results;
}

async function deploy() {
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

    executeOnDatabase(
        config,
        `CREATE TABLE IF NOT EXISTS ${metadataTable} (branch TEXT NOT NULL, seeded INTEGER NOT NULL DEFAULT 0, deployed_at INTEGER);` +
            ` INSERT INTO ${metadataTable} (branch) SELECT ${sqlString(branch)} WHERE NOT EXISTS (SELECT 1 FROM ${metadataTable});`,
    );

    // Like production (`npm run deploy`): applies the migrations not applied yet, so the database is kept between pushes to the branch
    wrangler(["d1", "migrations", "apply", "DB", "--remote", "--config", config]);

    const [metadata] = queryDatabase<{ seeded: number }>(config, `SELECT seeded FROM ${metadataTable}`);
    if (!metadata?.seeded) {
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
    executeOnDatabase(config, `UPDATE ${metadataTable} SET deployed_at = ${Date.now()};`);

    await cleanup();
}

type PreviewState = "exists" | "deleted" | "unknown";

// Error code of the Cloudflare API (and Wrangler) for a Preview that doesn't exist
const previewNotFoundCode = 10025;

// Checks whether a Preview exists with the Cloudflare API (the endpoint `wrangler preview` uses).
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, otherwise previewStateWithWrangler() is used.
async function previewStateWithApi(branch: string, apiToken: string, accountId: string): Promise<PreviewState> {
    // CLOUDFLARE_API_BASE_URL: also used by Wrangler
    const baseUrl = process.env.CLOUDFLARE_API_BASE_URL ?? "https://api.cloudflare.com/client/v4";
    const url = `${baseUrl}/accounts/${accountId}/workers/workers/${workerName}/previews/${encodeURIComponent(branch)}`;
    let response: Response;
    try {
        response = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
    } catch (error) {
        console.warn(`Cleanup: request for Preview "${branch}" failed: ${String(error)}`);
        return "unknown";
    }
    const body = (await response.json().catch(() => undefined)) as
        { success?: boolean; errors?: Array<{ code: number; message: string }> } | undefined;
    if (response.ok && body?.success) {
        return "exists";
    }
    if (body?.errors?.some((error) => error.code === previewNotFoundCode)) {
        return "deleted";
    }
    console.warn(`Cleanup: unexpected response for Preview "${branch}" (${response.status}): ${JSON.stringify(body?.errors)}`);
    return "unknown";
}

// Fallback without API credentials: there's no command to look up a Preview, listing its secrets fails with "was not found" if it doesn't exist
function previewStateWithWrangler(branch: string): PreviewState {
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

// Deletes the databases of deleted Previews (Workers Builds deletes a Preview when its branch is deleted, e.g. by GitHub after merging the pull request),
// and Previews not deployed for ttlDays together with their database.
// Never fails (it's run as part of deployments): when in doubt, a database is kept and deleted by a later run.
async function cleanup() {
    try {
        const apiToken = process.env.CLOUDFLARE_API_TOKEN;
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        const previewState = apiToken && accountId ? (branch: string) => previewStateWithApi(branch, apiToken, accountId) : previewStateWithWrangler;
        console.info(
            apiToken && accountId
                ? "Cleanup: checking Previews with the Cloudflare API"
                : `Cleanup: checking Previews with Wrangler (${[!apiToken && "CLOUDFLARE_API_TOKEN", !accountId && "CLOUDFLARE_ACCOUNT_ID"].filter(Boolean).join(" and ")} not set)`,
        );

        const databases = listD1Databases().filter((database) => database.name.startsWith(databasePrefix));
        for (const database of databases) {
            try {
                await cleanupDatabase(database, previewState);
            } catch (error) {
                console.warn(`Cleanup: skipping database ${database.name}`, error);
            }
        }
    } catch (error) {
        console.warn("Cleanup of Preview databases failed", error);
    }
}

async function cleanupDatabase(database: D1Database, previewState: (branch: string) => PreviewState | Promise<PreviewState>) {
    const createdAt = new Date(database.created_at).getTime();
    if (Date.now() - createdAt < cleanupGracePeriodMs) {
        return;
    }
    const [metadata] = queryDatabase<{ branch: string; deployed_at: number | null }>(
        writeD1Config(database),
        `SELECT branch, deployed_at FROM ${metadataTable}`,
    );
    if (!metadata) {
        console.warn(`Cleanup: database ${database.name} has no branch in ${metadataTable}, kept`);
        return;
    }
    const { branch } = metadata;
    const state = await previewState(branch);
    if (state === "unknown") {
        console.warn(`Cleanup: couldn't check Preview "${branch}", database ${database.name} kept`);
        return;
    }
    if (state === "exists") {
        // the database's creation if the Preview was never deployed successfully
        const lastDeployedAt = metadata.deployed_at ?? createdAt;
        if (Date.now() - lastDeployedAt < ttlDays * dayInMs) {
            return;
        }
        console.info(`Cleanup: Preview "${branch}" not deployed for more than ${ttlDays} days, deleting it`);
        wrangler(["preview", "delete", "--name", branch, "--skip-confirmation"]);
    } else {
        console.info(`Cleanup: Preview "${branch}" no longer exists`);
    }
    console.info(`Cleanup: deleting database ${database.name}`);
    wrangler(["d1", "delete", database.name, "--skip-confirmation", "--config", writeD1Config(undefined)]);
}

const command = process.argv[2];
if (command === "deploy") {
    await deploy();
} else if (command === "cleanup") {
    await cleanup();
} else {
    console.error("Usage: node scripts/preview.ts deploy|cleanup");
    process.exit(1);
}
