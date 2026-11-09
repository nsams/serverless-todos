import { Chatbot, Hamburger, Logout } from "@dextinity/admin-icons";
import { AppBar, Box, CircularProgress, Divider, Drawer, IconButton, ListSubheader, Toolbar, Typography } from "@mui/material";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { parseResponse } from "hono/client";
import { Fragment, lazy, Suspense, useState } from "react";

import { api } from "~/api/client";
import { appName } from "~/app";
import { appModules, loadNavigationData } from "~/modules/registry";

// Layout of the app pages: app bar and the navigation of the modules in a sidebar
export const Route = createFileRoute("/_app")({
    // the user and the navigation data of the modules (e.g. the lists in the sidebar), into the query cache
    loader: async ({ context: { queryClient } }) => {
        await Promise.all([queryClient.fetchQuery(userQueryOptions), loadNavigationData(queryClient)]);
    },
    // Not reloaded by navigations between the pages, only by an explicit revalidation (useRevalidate, e.g. after creating a list)
    staleTime: Infinity,
    // while the first page is loading
    pendingComponent: () => (
        <Box sx={{ display: "flex", justifyContent: "center", p: 8 }}>
            <CircularProgress />
        </Box>
    ),
    component: AppLayout,
});

const userQueryOptions = queryOptions({ queryKey: ["user"], queryFn: () => parseResponse(api.user.$get()) });

const drawerWidth = 260;
const chatWidth = 420;

// loaded on first open: the chat (MUI X Chat, Agents SDK client) is a large part of the app's code
const ChatPanel = lazy(() => import("~/components/ChatPanel"));

function AppLayout() {
    const { data: user } = useSuspenseQuery(userQueryOptions);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    // stays mounted once opened, so the conversation (and a running answer) survives closing the panel
    const [chatMounted, setChatMounted] = useState(false);

    const toggleChat = () => {
        setChatMounted(true);
        setChatOpen((open) => !open);
    };

    const drawerContent = (
        <>
            {/* space for the app bar */}
            <Toolbar />
            {appModules.map(
                ({ id, navigation }, index) =>
                    navigation && (
                        <Fragment key={id}>
                            {index > 0 && <Divider />}
                            <ListSubheader component="h2" disableSticky sx={{ pt: 1, lineHeight: 2.5 }}>
                                {navigation.title}
                            </ListSubheader>
                            <navigation.Component onNavigate={() => setMobileDrawerOpen(false)} />
                        </Fragment>
                    ),
            )}
        </>
    );

    return (
        <Box sx={{ display: "flex" }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                <Toolbar>
                    <IconButton
                        color="inherit"
                        edge="start"
                        aria-label="Open navigation"
                        onClick={() => setMobileDrawerOpen(true)}
                        sx={{ mr: 1, display: { md: "none" } }}
                    >
                        <Hamburger />
                    </IconButton>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        {appName}
                    </Typography>
                    <Typography sx={{ mr: 1, display: { xs: "none", sm: "block" } }}>{user.email}</Typography>
                    <IconButton color="inherit" aria-label="Assistant" aria-pressed={chatOpen} onClick={toggleChat}>
                        <Chatbot />
                    </IconButton>
                    {/* handled by Cloudflare Access, so a full page load */}
                    <IconButton href="/cdn-cgi/access/logout" color="inherit" aria-label="Logout">
                        <Logout />
                    </IconButton>
                </Toolbar>
            </AppBar>
            <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }} aria-label="Navigation">
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
            {/* on wide screens the open chat takes space from the page instead of covering it */}
            <Box component="main" sx={{ flexGrow: 1, minWidth: 0, mr: { lg: chatOpen ? `${chatWidth}px` : 0 } }}>
                <Toolbar />
                <Outlet />
            </Box>
            <Drawer anchor="right" variant="persistent" open={chatOpen} sx={{ "& .MuiDrawer-paper": { width: { xs: "100%", sm: chatWidth } } }}>
                {/* space for the app bar */}
                <Toolbar />
                {chatMounted && (
                    <Suspense
                        fallback={
                            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                                <CircularProgress />
                            </Box>
                        }
                    >
                        <ChatPanel onClose={() => setChatOpen(false)} />
                    </Suspense>
                )}
            </Drawer>
        </Box>
    );
}
