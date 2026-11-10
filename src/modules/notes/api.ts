import { createClient } from "~/api/client";

import type { notesApi } from "./api.server";
import { notesModuleId } from "./moduleId";

// The typed client of the module's REST API (api.server.ts, type-only import: no server code in the app)
export const notesClient = createClient<typeof notesApi>(notesModuleId);
