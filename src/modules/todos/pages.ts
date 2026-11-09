import type { AppPage } from "~/modules/types";

import { defaultListRoute, listRoute } from "./paths";
import { DefaultListPage } from "./routes/defaultList";
import { ListPage } from "./routes/list";

// The module's pages, mounted into the app layout
export const todosPages: AppPage[] = [
    { route: defaultListRoute, Component: DefaultListPage },
    { route: listRoute, Component: ListPage },
];
