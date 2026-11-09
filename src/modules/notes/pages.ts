import type { AppPage } from "~/modules/types";

import { defaultNotebookRoute, notebookRoute, noteRoute } from "./paths";
import { DefaultNotebookPage } from "./routes/defaultNotebook";
import { NotePage } from "./routes/note";
import { NotebookPage } from "./routes/notebook";

// The module's pages, mounted into the app layout
export const notesPages: AppPage[] = [
    { route: defaultNotebookRoute, Component: DefaultNotebookPage },
    { route: notebookRoute, Component: NotebookPage },
    { route: noteRoute, Component: NotePage },
];
