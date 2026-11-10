import { Add } from "@dextinity/admin-icons";
import { Divider, List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { useState } from "react";
import { NavLink, useMatch, useNavigate } from "react-router";

import { useInvalidateModule } from "~/client/queries";

import { NameDialog } from "./NameDialog";

export type NavigationItem = {
    id: string;
    name: string;
    // path of the item's page, e.g. listRoute.href({ listId })
    link: string;
    // shown next to the name if > 0, e.g. the number of open todos
    count?: number;
    // accessible name of the count, e.g. "3 open"
    countLabel?: string;
};

type Props = {
    // the module whose items they are: its data is reloaded after creating an item (e.g. the new list in the sidebar)
    moduleId: string;
    items: NavigationItem[];
    // e.g. "New list": button and dialog title
    createLabel: string;
    maxNameLength: number;
    // creates an item and returns the path of its page (opened then); throws a ValidationError with a message for the user, e.g. for
    // an empty name
    onCreate: (name: string) => Promise<string>;
    // closes the sidebar on small screens
    onNavigate: () => void;
};

// A module's items in the app's sidebar (e.g. the todo lists, the notebooks) with a button to create one
export function NavigationList({ moduleId, items, createLabel, maxNameLength, onCreate, onNavigate }: Props) {
    const navigate = useNavigate();
    const invalidate = useInvalidateModule(moduleId);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const handleCreate = async (name: string) => {
        const link = await onCreate(name);
        setCreateDialogOpen(false);
        onNavigate();
        await navigate(link);
        void invalidate();
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
