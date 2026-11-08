import { Chatbot, Hamburger, Logout } from "@dextinity/admin-icons";
import { AppBar, Box, CircularProgress, Drawer, IconButton, Toolbar, Typography } from "@mui/material";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";

import { appName } from "~/app";
import { appModules, loadNavigationData } from "~/modules/registry";
import { getCurrentUser } from "~/user.functions";

// Layout of the app pages: app bar and the navigation of the modules in a sidebar
export const Route = createFileRoute("/_app")({
    loader: async () => {
        const [user, navigation] = await Promise.all([getCurrentUser(), loadNavigationData()]);
        return { user, navigation };
    },
    component: AppLayout,
});

const drawerWidth = 260;
const chatWidth = 420;

// loaded on first open: the chat (MUI X Chat, Agents SDK client) is only needed in the browser
const ChatPanel = lazy(() => import("~/components/ChatPanel"));

function AppLayout() {
    const { user } = Route.useLoaderData();
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
            {appModules.map(({ id, navigation }) => navigation && <navigation.Component key={id} onNavigate={() => setMobileDrawerOpen(false)} />)}
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
