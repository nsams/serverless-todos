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
// leave, leave without saving, or stay. Returns the dialog, to be rendered by the form. Reloading or closing the tab can only get the
// browser's own (unstyled) confirmation.
//
// React Router's useBlocker only works in a data router: that's why src/main.tsx wraps the declarative <Routes> in one (see there).
// It blocks every navigation of the router (links, navigate(), back/forward: a POP is undone and replayed on proceed) until
// proceed() or reset(); the blocker function itself is synchronous, saving happens in the dialog in between.
export function useUnsavedChangesPrompt({ dirty, save, stays }: Options) {
    // the function the router calls is the one of the last render (registered in an effect): a navigation started right after a save
    // still sees dirty, see stays
    const blocker = useBlocker((args) => dirty && !stays?.(args));
    const [saving, setSaving] = useState(false);

    // Reloading or closing the tab: useBlocker only blocks the router's navigations
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
