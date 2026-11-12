import { useEffect, useState } from "react";
import { type BlockerFunction, useBlocker } from "react-router";

import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

type Options = {
    // the form has unsaved changes
    dirty: boolean;
    // saves the form: true if saved (then the page is left), false if not (invalid input or saving failed: the form shows why)
    save: () => Promise<boolean>;
    // navigations that don't leave the form (e.g. the URL following the edited item), never blocked
    stays?: BlockerFunction;
};

// Asks whether to save the unsaved changes of a form before leaving the page (links, browser back/forward) in a dialog: save and
// leave, leave without saving, or stay (React Router's useBlocker). Returns the dialog, to be rendered by the form. Reloading or closing
// the tab can only get the browser's own (unstyled) confirmation.
export function useUnsavedChangesPrompt({ dirty, save, stays }: Options) {
    // the router calls the function of the last render (set in an effect): right after a save (before the next render) it still sees the
    // old dirty state, hence `stays` for a navigation that follows the save
    const blocker = useBlocker((args) => dirty && !stays?.(args));
    const [saving, setSaving] = useState(false);

    // useBlocker only blocks the router's navigations
    useEffect(() => {
        if (!dirty) {
            return;
        }
        const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [dirty]);

    const handleSave = async () => {
        if (blocker.state !== "blocked") {
            return;
        }
        setSaving(true);
        try {
            if (await save()) {
                blocker.proceed();
            } else {
                blocker.reset();
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
