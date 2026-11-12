import { Button } from "@dextinity/ui";
import { type FormEvent, useState } from "react";

import { errorMessage } from "~/errors";

import { Dialog, DialogActions, DialogContent } from "./ui/Dialog";
import { TextField } from "./ui/TextField";

type Props = {
    open: boolean;
    title: string;
    submitLabel: string;
    // label of the field
    label?: string;
    initialName?: string;
    maxLength: number;
    onClose: () => void;
    // the dialog is closed by the caller; a ValidationError's message (e.g. "Name is required") is shown in the field
    onSubmit: (name: string) => Promise<void>;
};

// Dialog with a single name field, e.g. to create or rename a list, or the title of a new note
export function NameDialog({ open, title, submitLabel, label = "Name", initialName = "", maxLength, onClose, onSubmit }: Props) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPending(true);
        try {
            await onSubmit(String(new FormData(event.currentTarget).get("name") ?? ""));
            setError(null);
        } catch (error) {
            setError(errorMessage(error));
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} title={title} onClosed={() => setError(null)}>
            <form onSubmit={(event) => void handleSubmit(event)}>
                <DialogContent>
                    {/* key: reset the uncontrolled field whenever the dialog is opened */}
                    <TextField key={String(open)} name="name" label={label} defaultValue={initialName} error={error} maxLength={maxLength} />
                </DialogContent>
                <DialogActions>
                    <Button variant="text" color="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={pending}>
                        {submitLabel}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
