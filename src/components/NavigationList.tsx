import { Add } from "@dextinity/admin-icons";
import { Divider, List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { createLink, type LinkOptions, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useRefresh } from "~/routing";

import { NameDialog } from "./NameDialog";

// a ListItemButton that is a (typed) router link
const ListItemLink = createLink(ListItemButton);

export type NavigationItem = {
    id: string;
    name: string;
    // the item's page, e.g. linkOptions({ to: "/lists/$listId", params: { listId } }) (checked against the route tree)
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
    // creates an item; returns an error message, or the link to the created item's page
    onCreate: (name: string) => Promise<{ error: string } | { link: LinkOptions }>;
    // closes the sidebar on small screens
    onNavigate: () => void;
};

// A module's items in the app's sidebar (e.g. the todo lists, the notebooks) with a button to create one
export function NavigationList({ items, createLabel, maxNameLength, onCreate, onNavigate }: Props) {
    const refresh = useRefresh();
    const navigate = useNavigate();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const handleCreate = async (name: string) => {
        const result = await onCreate(name);
        if ("error" in result) {
            return result.error;
        }
        setCreateDialogOpen(false);
        onNavigate();
        // the created item's page, with the sidebar's items (the new one) loaded again
        await refresh(() => navigate(result.link));
        return null;
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
