import { parseResponse } from "hono/client";

import { api } from "~/api/client";
import { useNavigationData } from "~/modules/navigation";

export const notesModuleId = "notes";

// The user's notebooks with their number of notes: the navigation data of the module, loaded by the app layout
export function loadNotebooks() {
    return parseResponse(api.notebooks.$get());
}

export function useNotebooks() {
    return useNavigationData(notesModuleId) as Awaited<ReturnType<typeof loadNotebooks>>;
}
