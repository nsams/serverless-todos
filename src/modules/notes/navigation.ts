import type { ApiOutputs } from "~/api/client";
import { useNavigationData } from "~/modules/navigation";

export const notesModuleId = "notes";

// The user's notebooks with their number of notes: the navigation data of the module (loaded by the app layout with api.notebooks.list)
export function useNotebooks() {
    return useNavigationData(notesModuleId) as ApiOutputs["notebooks"]["list"];
}
