import { replace } from "react-router";

import { api } from "~/api/client";

import { listPath } from "../paths";

// /lists: the user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export async function defaultListLoader() {
    const { id } = await api.lists.getDefault.mutate();
    throw replace(listPath(id));
}
