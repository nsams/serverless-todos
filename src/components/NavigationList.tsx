import { Add } from "@dextinity/admin-icons";
import { Divider, List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { createLink, type LinkOptions } from "@tanstack/react-router";
import { useState } from "react";

import { NameDialog } from "./NameDialog";

const ListItemLink = createLink(ListItemButton);

export type NavigationItem = {
    id: string;
    name: string;
    // e.g. linkOptions({ to: "/lists/$listId", params: { listId } })
    link: LinkOptions;
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
    // creates an item, navigates to it and reloads the items; throws a ValidationError with a message for the user, e.g. for an empty name
    onCreate: (name: string) => Promise<void>;
    // closes the sidebar on small screens
    onNavigate: () => void;
};

// A module's items in the app's sidebar (e.g. the todo lists, the notebooks) with a button to create one
export function NavigationList({ items, createLabel, maxNameLength, onCreate, onNavigate }: Props) {
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const handleCreate = async (name: string) => {
        await onCreate(name);
        setCreateDialogOpen(false);
        onNavigate();
    };

    return (
        <>
            <List>
                {items.map((item) => (
                    <ListItemLink
                        key={item.id}
                        {...item.link}
                        // also active on the item's sub pages and with search params (e.g. a grid's filters)
                        activeOptions={{ includeSearch: false }}
                        activeProps={{ selected: true }}
                        onClick={onNavigate}
                    >
                        <ListItemText primary={item.name} slotProps={{ primary: { noWrap: true } }} />
                        {item.count !== undefined && item.count > 0 && (
                            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }} aria-label={item.countLabel}>
                                {item.count}
                            </Typography>
                        )}
                    </ListItemLink>
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
