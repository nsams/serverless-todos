import { Icon, IconButton, Typography } from "@dextinity/ui";
import { useState } from "react";

import { useInvalidateModule } from "~/client/queries";
import { useLeavePage } from "~/client/routing";

import styles from "./CollectionHeader.module.css";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { NameDialog } from "./NameDialog";
import layout from "./ui/layout.module.css";
import { Tooltip } from "./ui/Tooltip";

type Props = {
    // the module whose data changes: reloaded after renaming (e.g. the name in the sidebar) and after deleting
    moduleId: string;
    name: string;
    // what the collection is, in the labels: "list" → "Rename list", "Delete list?"
    kind: string;
    // what deleting deletes, e.g. "“Work” and all its todos will be deleted."
    deleteText: string;
    maxNameLength: number;
    // throws a ValidationError with a message for the user, e.g. for an empty name
    onRename: (name: string) => Promise<unknown>;
    // deletes the collection; returns the page to go to (e.g. the module's index page)
    onDelete: () => Promise<string>;
};

// The heading of a page that shows a collection (e.g. a todo list, a notebook), with rename and delete buttons
export function CollectionHeader({ moduleId, name, kind, deleteText, maxNameLength, onRename, onDelete }: Props) {
    const leavePage = useLeavePage();
    const invalidate = useInvalidateModule(moduleId);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const handleRename = async (newName: string) => {
        await onRename(newName);
        setRenameDialogOpen(false);
        await invalidate();
    };

    const handleDelete = async () => {
        leavePage(await onDelete(), { replace: true });
        // after leaving the page (reloaded on the page, the deleted collection would be "not found")
        void invalidate();
    };

    return (
        <div className={layout.row}>
            <Typography variant="h1" className={styles.title}>
                {name}
            </Typography>
            <Tooltip title={`Rename ${kind}`}>
                <IconButton variant="text" color="secondary" onClick={() => setRenameDialogOpen(true)} aria-label={`Rename ${kind}`}>
                    <Icon name="edit" />
                </IconButton>
            </Tooltip>
            <Tooltip title={`Delete ${kind}`}>
                <IconButton variant="text" color="secondary" onClick={() => setDeleteDialogOpen(true)} aria-label={`Delete ${kind}`}>
                    <Icon name="delete" />
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
                onDelete={handleDelete}
            />
        </div>
    );
}
