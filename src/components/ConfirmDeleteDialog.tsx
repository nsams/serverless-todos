import { Button } from "@dextinity/ui";
import { useState } from "react";

import { useShowError } from "./ErrorSnackbar";
import { Dialog, DialogActions, DialogContent, DialogText } from "./ui/Dialog";

type Props = {
    open: boolean;
    // e.g. "Delete list?"
    title: string;
    // what will be deleted, e.g. "“Work” and all its todos will be deleted."
    text: string;
    // shown if deleting fails
    errorMessage: string;
    onClose: () => void;
    // deletes (and e.g. leaves the page); the dialog is closed afterwards
    onDelete: () => Promise<void>;
};

// Confirmation before something is deleted
export function ConfirmDeleteDialog({ open, title, text, errorMessage, onClose, onDelete }: Props) {
    const showError = useShowError();
    const [deleting, setDeleting] = useState(false);
    // kept while the dialog is closing (the caller may clear what it deletes on close)
    const [shownText, setShownText] = useState(text);
    if (open && text !== shownText) {
        setShownText(text);
    }

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await onDelete();
            onClose();
        } catch (error) {
            console.error(error);
            showError(errorMessage);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} title={title}>
            <DialogContent>
                <DialogText>{shownText}</DialogText>
            </DialogContent>
            <DialogActions>
                <Button variant="text" color="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button color="error" loading={deleting} onClick={() => void handleDelete()}>
                    Delete
                </Button>
            </DialogActions>
        </Dialog>
    );
}
