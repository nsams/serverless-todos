import { useNavigationData } from "~/modules/navigation";

import type { listNotebooks } from "./notebooks.functions";

export const notesModuleId = "notes";

// The user's notebooks with their number of notes: the navigation data of the module (loaded by the app layout with listNotebooks)
export function useNotebooks() {
    return useNavigationData(notesModuleId) as Awaited<ReturnType<typeof listNotebooks>>;
}
