import { parseResponse } from "hono/client";

import { defineNavigationData } from "~/client/routing";

import { notesClient } from "./api";
import { notesModuleId } from "./moduleId";

// The user's notebooks with their number of notes: the navigation data of the module (sidebar), also used by the notes pages
export const notebooksNavigation = defineNavigationData(notesModuleId, () => parseResponse(notesClient.notebooks.$get()));

export const useNotebooks = notebooksNavigation.useData;
