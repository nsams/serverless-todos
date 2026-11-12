import { createClient } from "~/api/client";

import type { todosApi } from "./api.server";
import { todosModuleId } from "./moduleId";

// The typed client of the module's REST API (api.server.ts, type-only import: no server code in the app)
export const todosClient = createClient<typeof todosApi>(todosModuleId);
