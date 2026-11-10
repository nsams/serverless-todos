import { Delete, Edit } from "@dextinity/admin-icons";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useState } from "react";

import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { NameDialog } from "./NameDialog";

type Props = {
    name: string;
    // what the collection is, in the labels: "list" → "Rename list", "Delete list?"
    kind: string;
    // what deleting deletes, e.g. "“Work” and all its todos will be deleted."
    deleteText: string;
    maxNameLength: number;
    // throws a ValidationError with a message for the user, e.g. for an empty name
    onRename: (name: string) => Promise<void>;
    // deletes the collection and leaves the page
    onDelete: () => Promise<void>;
};

// The heading of a page that shows a collection (e.g. a todo list, a notebook), with rename and delete buttons
export function CollectionHeader({ name, kind, deleteText, maxNameLength, onRename, onDelete }: Props) {
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const handleRename = async (newName: string) => {
        await onRename(newName);
        setRenameDialogOpen(false);
    };

    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h5" component="h1" sx={{ flexGrow: 1, overflowWrap: "anywhere" }}>
                {name}
            </Typography>
            <Tooltip title={`Rename ${kind}`}>
                <IconButton onClick={() => setRenameDialogOpen(true)} aria-label={`Rename ${kind}`}>
                    <Edit />
                </IconButton>
            </Tooltip>
            <Tooltip title={`Delete ${kind}`}>
                <IconButton onClick={() => setDeleteDialogOpen(true)} aria-label={`Delete ${kind}`}>
                    <Delete />
                </IconButton>
            </Tooltip>
            <NameDialog
                open={renameDialogOpen}
                title={`Rename ${kind}`}
                submitLabel="Rename"
                initialName={name}
                maxLength={maxNameLength}
                onClose={() => setRenameDialogOpen(false)}
                onSubmit={handleRename}
            />
            <ConfirmDeleteDialog
                open={deleteDialogOpen}
                title={`Delete ${kind}?`}
                text={deleteText}
                errorMessage={`Deleting the ${kind} failed, please try again.`}
                onClose={() => setDeleteDialogOpen(false)}
                onDelete={onDelete}
            />
        </Box>
    );
}
