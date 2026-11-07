import { Add, Hamburger, Logout } from "@dextinity/admin-icons";
import { AppBar, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography } from "@mui/material";
import { createFileRoute, createLink, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { NameDialog } from "~/components/NameDialog";
import { maxListNameLength } from "~/limits";
import { createList, listLists } from "~/lists.functions";

// Layout of the app pages: app bar and the user's lists in a sidebar
export const Route = createFileRoute("/_app")({
    loader: () => listLists(),
    component: AppLayout,
});

const drawerWidth = 260;

const ListItemLink = createLink(ListItemButton);

// read by screen readers, not shown
const visuallyHidden = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

function AppLayout() {
    const { user, lists } = Route.useLoaderData();
    const navigate = useNavigate();
    const router = useRouter();
    const createListFn = useServerFn(createList);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const handleCreateList = async (name: string) => {
        const result = await createListFn({ data: { name } });
        if (result.id !== null) {
            setCreateDialogOpen(false);
            setMobileDrawerOpen(false);
            await navigate({ to: "/lists/$listId", params: { listId: result.id } });
            // the sidebar's lists aren't reloaded by the navigation (the layout route's loader data is reused)
            await router.invalidate({ filter: (match) => match.routeId === Route.id });
        }
        return result.error;
    };

    const drawerContent = (
        <>
            {/* space for the app bar */}
            <Toolbar />
            <List>
                {lists.map((list) => (
                    <ListItemLink
                        key={list.id}
                        to="/lists/$listId"
                        params={{ listId: list.id }}
                        activeProps={{ selected: true }}
                        onClick={() => setMobileDrawerOpen(false)}
                    >
                        <ListItemText primary={list.name} slotProps={{ primary: { noWrap: true } }} />
                        {list.openCount > 0 && (
                            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                                {list.openCount}
                                <Box component="span" sx={visuallyHidden}>
                                    {" "}
                                    open
                                </Box>
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
        </>
    );

    return (
        <Box sx={{ display: "flex" }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                <Toolbar>
                    <IconButton
                        color="inherit"
                        edge="start"
                        aria-label="Open lists"
                        onClick={() => setMobileDrawerOpen(true)}
                        sx={{ mr: 1, display: { md: "none" } }}
                    >
                        <Hamburger />
                    </IconButton>
                    {/* not a heading: the page's h1 is the list name */}
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Todos
                    </Typography>
                    <Typography sx={{ mr: 1, display: { xs: "none", sm: "block" } }}>{user.email}</Typography>
                    {/* handled by Cloudflare Access, so a full page load */}
                    <IconButton href="/cdn-cgi/access/logout" color="inherit" aria-label="Logout">
                        <Logout />
                    </IconButton>
                </Toolbar>
            </AppBar>
            <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }} aria-label="Lists">
                <Drawer
                    variant="temporary"
                    open={mobileDrawerOpen}
                    onClose={() => setMobileDrawerOpen(false)}
                    sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: drawerWidth } }}
                >
                    {drawerContent}
                </Drawer>
                <Drawer variant="permanent" open sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { width: drawerWidth } }}>
                    {drawerContent}
                </Drawer>
            </Box>
            <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
                <Toolbar />
                <Outlet />
            </Box>
            <NameDialog
                open={createDialogOpen}
                title="New list"
                submitLabel="Create"
                maxLength={maxListNameLength}
                onClose={() => setCreateDialogOpen(false)}
                onSubmit={handleCreateList}
            />
        </Box>
    );
}
