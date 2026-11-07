import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { type FormEvent, useState } from "react";

type Props = {
    open: boolean;
    title: string;
    submitLabel: string;
    initialName?: string;
    maxLength: number;
    onClose: () => void;
    // returns an error message, or null on success (the dialog is closed by the caller)
    onSubmit: (name: string) => Promise<string | null>;
};

// Dialog with a single name field, e.g. to create or rename a list
export function NameDialog({ open, title, submitLabel, initialName = "", maxLength, onClose, onSubmit }: Props) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPending(true);
        try {
            setError(await onSubmit(String(new FormData(event.currentTarget).get("name") ?? "")));
        } catch (error) {
            console.error(error);
            setError("Saving failed, please try again.");
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ transition: { onExited: () => setError(null) } }}>
            <form onSubmit={(event) => void handleSubmit(event)}>
                <DialogTitle>{title}</DialogTitle>
                <DialogContent>
                    {/* key: reset the uncontrolled field whenever the dialog is opened */}
                    <TextField
                        key={String(open)}
                        name="name"
                        label="Name"
                        defaultValue={initialName}
                        autoFocus
                        fullWidth
                        margin="dense"
                        error={!!error}
                        helperText={error}
                        slotProps={{ htmlInput: { maxLength } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={pending}>
                        {submitLabel}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
