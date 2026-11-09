import { useEffect } from "react";

import { appName } from "~/app";

// The page title (browser tab, history): the page's name (e.g. the list's name) and the app's name
export function useDocumentTitle(pageName?: string) {
    useEffect(() => {
        document.title = pageName ? `${pageName} – ${appName}` : appName;
    }, [pageName]);
}
