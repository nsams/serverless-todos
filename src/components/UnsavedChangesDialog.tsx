import { Button } from "@dextinity/ui";

import { Dialog, DialogActions, DialogContent, DialogText } from "./ui/Dialog";

type Props = {
    open: boolean;
    // the changes are being saved (Save shows a spinner, nothing else can be clicked)
    saving: boolean;
    // saves the changes, then leaves the page (stays if saving fails)
    onSave: () => void;
    // leaves the page without saving
    onDiscard: () => void;
    // stays on the page
    onCancel: () => void;
};

// Asked when leaving a form with unsaved changes (see useUnsavedChangesPrompt)
export function UnsavedChangesDialog({ open, saving, onSave, onDiscard, onCancel }: Props) {
    return (
        <Dialog open={open} onClose={() => !saving && onCancel()} title="Save changes?">
            <DialogContent>
                <DialogText>You have unsaved changes. Do you want to save them before leaving the page?</DialogText>
            </DialogContent>
            <DialogActions>
                <Button variant="text" color="secondary" onClick={onCancel} disabled={saving}>
                    Cancel
                </Button>
                <Button variant="outlined" color="error" onClick={onDiscard} disabled={saving}>
                    Discard
                </Button>
                <Button onClick={onSave} loading={saving}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
