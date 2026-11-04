import { requireUser } from "~/auth.server";
import { getTodoRepository } from "~/db/todos.server";
import { parseGridState } from "~/todosGridState";

import type { Route } from "./+types/todos.list";

// Resource route for the todo grid, loaded by a fetcher: the filter isn't part of the page URL, so it can't be read by the page loader
export async function loader({ request, url }: Route.LoaderArgs) {
    const user = await requireUser(request);
    const { page, pageSize, sort, filter } = parseGridState(url.searchParams);
    return getTodoRepository().list(user.id, { offset: page * pageSize, limit: pageSize, sort, filter });
}
