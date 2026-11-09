import { Add } from "@dextinity/admin-icons";
import { Divider, List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { useState } from "react";
import { Link, matchPath, useLocation } from "react-router";

import { NameDialog } from "./NameDialog";

export type NavigationItem = {
    id: string;
    name: string;
    // e.g. href("/lists/:listId", { listId })
    to: string;
    // shown next to the name if > 0, e.g. the number of open todos
    count?: number;
    // accessible name of the count, e.g. "3 open"
    countLabel?: string;
};

type Props = {
    items: NavigationItem[];
    // e.g. "New list": button and dialog title
    createLabel: string;
    maxNameLength: number;
    // creates an item and goes to it; returns an error message, or null on success
    onCreate: (name: string) => Promise<string | null>;
    // closes the sidebar on small screens
    onNavigate: () => void;
};

// A module's items in the app's sidebar (e.g. the todo lists, the notebooks) with a button to create one
export function NavigationList({ items, createLabel, maxNameLength, onCreate, onNavigate }: Props) {
    const { pathname } = useLocation();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const handleCreate = async (name: string) => {
        const error = await onCreate(name);
        if (error === null) {
            setCreateDialogOpen(false);
            onNavigate();
        }
        return error;
    };

    return (
        <>
            <List>
                {items.map((item) => (
                    <ListItemButton
                        key={item.id}
                        component={Link}
                        to={item.to}
                        // also active on the item's sub pages and with search params (e.g. a grid's filters)
                        selected={matchPath({ path: item.to, end: false }, pathname) !== null}
                        onClick={onNavigate}
                    >
                        <ListItemText primary={item.name} slotProps={{ primary: { noWrap: true } }} />
                        {item.count !== undefined && item.count > 0 && (
                            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }} aria-label={item.countLabel}>
                                {item.count}
                            </Typography>
                        )}
                    </ListItemButton>
                ))}
            </List>
            <Divider />
            <List>
                <ListItemButton onClick={() => setCreateDialogOpen(true)}>
                    <ListItemIcon>
                        <Add />
                    </ListItemIcon>
                    <ListItemText primary={createLabel} />
                </ListItemButton>
            </List>
            <NameDialog
                open={createDialogOpen}
                title={createLabel}
                submitLabel="Create"
                maxLength={maxNameLength}
                onClose={() => setCreateDialogOpen(false)}
                onSubmit={handleCreate}
            />
        </>
    );
}
