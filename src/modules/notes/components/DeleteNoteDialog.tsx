import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";
import { useState } from "react";

import { useShowError } from "~/components/ErrorSnackbar";

type Props = {
    // the note to delete, null: closed
    note: { title: string } | null;
    onClose: () => void;
    // deletes the note; the dialog is closed afterwards
    onDelete: () => Promise<void>;
};

// Confirmation before a note is deleted (from the grid or the editor)
export function DeleteNoteDialog({ note, onClose, onDelete }: Props) {
    const showError = useShowError();
    const [deleting, setDeleting] = useState(false);
    // kept while the dialog is closing
    const [title, setTitle] = useState("");
    if (note && note.title !== title) {
        setTitle(note.title);
    }

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await onDelete();
            onClose();
        } catch (error) {
            console.error(error);
            showError("Deleting the note failed, please try again.");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Dialog open={note !== null} onClose={onClose}>
            <DialogTitle>Delete note?</DialogTitle>
            <DialogContent>
                <DialogContentText>“{title}” will be deleted.</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button color="error" variant="contained" disabled={deleting} onClick={() => void handleDelete()}>
                    Delete
                </Button>
            </DialogActions>
        </Dialog>
    );
}
