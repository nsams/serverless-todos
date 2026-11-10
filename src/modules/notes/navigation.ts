import { parseResponse } from "hono/client";

import { useNavigationData } from "~/modules/navigation";

import { notesClient } from "./api";
import { notesModuleId } from "./moduleId";

// The user's notebooks with their number of notes: the navigation data of the module, loaded by the app layout
export function loadNotebooks() {
    return parseResponse(notesClient.notebooks.$get());
}

export function useNotebooks() {
    return useNavigationData(notesModuleId) as Awaited<ReturnType<typeof loadNotebooks>>;
}
