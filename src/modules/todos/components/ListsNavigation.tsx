import { Add } from "@dextinity/admin-icons";
import { Divider, List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { createLink, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { NameDialog } from "~/components/NameDialog";

import { maxListNameLength } from "../limits";
import { createList } from "../lists.functions";
import { useLists } from "../navigation";

const ListItemLink = createLink(ListItemButton);

// The user's lists in the app's sidebar
export function ListsNavigation({ onNavigate }: { onNavigate: () => void }) {
    const lists = useLists();
    const navigate = useNavigate();
    const createListFn = useServerFn(createList);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const handleCreateList = async (name: string) => {
        const result = await createListFn({ data: { name } });
        if (result.id !== null) {
            setCreateDialogOpen(false);
            onNavigate();
            await navigate({ to: "/lists/$listId", params: { listId: result.id } });
        }
        return result.error;
    };

    return (
        <>
            <List>
                {lists.map((list) => (
                    <ListItemLink
                        key={list.id}
                        to="/lists/$listId"
                        params={{ listId: list.id }}
                        activeProps={{ selected: true }}
                        onClick={onNavigate}
                    >
                        <ListItemText primary={list.name} slotProps={{ primary: { noWrap: true } }} />
                        {list.openCount > 0 && (
                            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }} aria-label={`${list.openCount} open`}>
                                {list.openCount}
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
                    <ListItemText primary="New list" />
                </ListItemButton>
            </List>
            <NameDialog
                open={createDialogOpen}
                title="New list"
                submitLabel="Create"
                maxLength={maxListNameLength}
                onClose={() => setCreateDialogOpen(false)}
                onSubmit={handleCreateList}
            />
        </>
    );
}
