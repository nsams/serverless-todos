import { replace } from "react-router";

import { api } from "~/api/client";

import { notebookPath } from "../paths";

// /notes: the user's first notebook (created if the user has none yet)
export async function defaultNotebookLoader() {
    const { id } = await api.notebooks.getDefault.mutate();
    throw replace(notebookPath(id));
}
