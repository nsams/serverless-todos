import { useEffect, useState } from "react";
import { type BlockerFunction, useBlocker } from "react-router";

import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

type Options = {
    // the form has unsaved changes
    dirty: boolean;
    // saves the form: true if saved (then the page is left), false if not (invalid input or saving failed: the form shows why)
    save: () => Promise<boolean>;
    // navigations that don't leave the form (e.g. the URL following the edited item), never blocked
    stays?: (navigation: Parameters<BlockerFunction>[0]) => boolean;
};

// Asks whether to save the unsaved changes of a form before leaving the page (links, browser back/forward) in a dialog: save and
// leave, leave without saving, or stay. Returns the dialog, to be rendered by the form. Reloading or closing the tab can only get the
// browser's own (unstyled) confirmation.
// React Router's useBlocker only works in a data router: that's why the app's declarative <Routes> are rendered by a data router
// (src/client/main.tsx), in a <BrowserRouter> it throws ("useBlocker must be used within a data router").
export function useUnsavedChangesPrompt({ dirty, save, stays }: Options) {
    // (the function is the one of the last render: right after a reset() of the form it still sees it dirty, see stays)
    const blocker = useBlocker((navigation) => dirty && !stays?.(navigation));
    const [saving, setSaving] = useState(false);

    // Reloading or closing the tab: the browser's confirmation (useBlocker only blocks the router's navigations)
    useEffect(() => {
        if (!dirty) {
            return;
        }
        const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [dirty]);

    const handleSave = async () => {
        setSaving(true);
        try {
            if (await save()) {
                blocker.proceed?.();
            } else {
                blocker.reset?.();
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <UnsavedChangesDialog
            open={blocker.state === "blocked"}
            saving={saving}
            onSave={() => void handleSave()}
            onDiscard={() => blocker.proceed?.()}
            onCancel={() => blocker.reset?.()}
        />
    );
}
