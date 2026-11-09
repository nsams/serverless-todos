import { useNavigationData } from "~/modules/navigation";

import type { NotebookWithCount } from "./db/notebooks.server";

export const notesModuleId = "notes";

// The user's notebooks with their number of notes: the navigation data of the module (loaded by the app layout, see module.server.ts)
export function useNotebooks() {
    return useNavigationData(notesModuleId) as NotebookWithCount[];
}
