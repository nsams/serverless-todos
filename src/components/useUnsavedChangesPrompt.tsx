import { type ShouldBlockFn, useBlocker } from "@tanstack/react-router";
import { useState } from "react";

import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

type Options = {
    // the form has unsaved changes
    dirty: boolean;
    // saves the form: true if saved (then the page is left), false if not (invalid input or saving failed: the form shows why)
    save: () => Promise<boolean>;
    // navigations that don't leave the form (e.g. the URL following the edited item), never blocked
    stays?: ShouldBlockFn;
};

// Asks whether to save the unsaved changes of a form before leaving the page (links, browser back/forward) in a dialog: save and
// leave, leave without saving, or stay. Returns the dialog, to be rendered by the form. Reloading or closing the tab can only get the
// browser's own (unstyled) confirmation.
export function useUnsavedChangesPrompt({ dirty, save, stays }: Options) {
    const blocker = useBlocker({
        shouldBlockFn: async (args) => dirty && !(await stays?.(args)),
        enableBeforeUnload: dirty,
        withResolver: true,
    });
    const [saving, setSaving] = useState(false);

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
            open={blocker.status === "blocked"}
            saving={saving}
            onSave={() => void handleSave()}
            onDiscard={() => blocker.proceed?.()}
            onCancel={() => blocker.reset?.()}
        />
    );
}
