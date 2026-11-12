import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

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
        <Dialog open={open} onClose={() => !saving && onCancel()} aria-labelledby="unsaved-changes-title">
            <DialogTitle id="unsaved-changes-title">Save changes?</DialogTitle>
            <DialogContent>
                <DialogContentText>You have unsaved changes. Do you want to save them before leaving the page?</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} disabled={saving}>
                    Cancel
                </Button>
                <Button color="error" onClick={onDiscard} disabled={saving}>
                    Discard
                </Button>
                <Button variant="contained" onClick={onSave} loading={saving}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
