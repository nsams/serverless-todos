import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import type { User } from "~/auth.server";

// The context of the API's handlers: the authenticated user (set by the middleware in src/server.ts)
export type ApiEnv = { Bindings: Env; Variables: { user: User } };

// A part of the API, e.g. the routes of a module (mounted by src/api/api.server.ts)
export function createApi() {
    return new Hono<ApiEnv>();
}

// The search params of a grid (src/gridSearch.ts) as query: the handler normalizes them leniently (invalid values are dropped)
// with the validateSearch of the page, like the page
export const gridQueryValidator = zValidator("query", z.record(z.string(), z.union([z.string(), z.array(z.string())])));
