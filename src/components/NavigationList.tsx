import { Add } from "@dextinity/admin-icons";
import { Divider, List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { useState } from "react";
import { NavLink, useMatch, useRevalidator } from "react-router";

import { NameDialog } from "./NameDialog";

export type NavigationItem = {
    id: string;
    name: string;
    // path of the item's page, e.g. generatePath(listPath, { listId })
    link: string;
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
    // creates an item and navigates to it; throws a ValidationError with a message for the user, e.g. for an empty name
    onCreate: (name: string) => Promise<void>;
    // closes the sidebar on small screens
    onNavigate: () => void;
};

// A module's items in the app's sidebar (e.g. the todo lists, the notebooks) with a button to create one
export function NavigationList({ items, createLabel, maxNameLength, onCreate, onNavigate }: Props) {
    const { revalidate } = useRevalidator();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const handleCreate = async (name: string) => {
        await onCreate(name);
        setCreateDialogOpen(false);
        onNavigate();
        // the new item: the sidebar's data isn't reloaded by the navigation (the app layout's loader data is reused)
        await revalidate();
    };

    return (
        <>
            <List>
                {items.map((item) => (
                    <NavigationListItem key={item.id} item={item} onNavigate={onNavigate} />
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

function NavigationListItem({ item, onNavigate }: { item: NavigationItem; onNavigate: () => void }) {
    // also active on the item's sub pages (e.g. a note of a notebook), like NavLink (which sets aria-current)
    const active = useMatch({ path: item.link, end: false }) !== null;
    return (
        <ListItemButton component={NavLink} to={item.link} selected={active} onClick={onNavigate}>
            <ListItemText primary={item.name} slotProps={{ primary: { noWrap: true } }} />
            {item.count !== undefined && item.count > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }} aria-label={item.countLabel}>
                    {item.count}
                </Typography>
            )}
        </ListItemButton>
    );
}
