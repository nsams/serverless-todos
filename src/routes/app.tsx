import { Chatbot, Hamburger, Logout } from "@dextinity/admin-icons";
import {
    AppBar,
    Box,
    CircularProgress,
    Divider,
    Drawer,
    IconButton,
    LinearProgress,
    ListSubheader,
    Skeleton,
    Toolbar,
    Typography,
} from "@mui/material";
import { useIsFetching, useQuery } from "@tanstack/react-query";
import { Fragment, lazy, Suspense, useState } from "react";
import { Outlet } from "react-router";

import { coreApi } from "~/api/client";
import { appName } from "~/app";
import { ChatPageProvider } from "~/chat/useChatPage";
import { appModules } from "~/modules/registry";

import { PageLoading, RouteErrorBoundary } from "./root";

// Layout of the app pages: app bar, the navigation of the modules in a sidebar and the chat. The sidebar's data is loaded by the modules'
// navigation components (cached, so not reloaded on every page or change of the search params; reloaded after changes of their module)

const drawerWidth = 260;
const chatWidth = 420;

// loaded on first open: the chat (MUI X Chat, Agents SDK client) is only needed in the browser
const ChatPanel = lazy(() => import("~/components/ChatPanel"));

export function AppLayout() {
    // the user doesn't change while the app is open; the page doesn't wait for it
    const user = useQuery({ ...coreApi.user.queryOptions(), staleTime: Infinity }).data;
    // Data loaded for the first time, e.g. the next page's: the router keeps showing the current page meanwhile (a transition), this
    // shows that something is happening. Not shown for reloads of data that is shown already.
    const loading = useIsFetching({ predicate: (query) => query.state.data === undefined }) > 0;
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
                            <Suspense fallback={<NavigationSkeleton />}>
                                <navigation.Component onNavigate={() => setMobileDrawerOpen(false)} />
                            </Suspense>
                        </Fragment>
                    ),
            )}
        </>
    );

    return (
        // the pages report what they show (useChatPage), the chat panel sends it with every message
        <ChatPageProvider>
            <Box sx={{ display: "flex" }}>
                <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                    {loading && <LinearProgress color="secondary" sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 2 }} />}
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
                        <Typography sx={{ mr: 1, display: { xs: "none", sm: "block" } }}>{user?.email}</Typography>
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
                    {/* errors of the pages (e.g. 404) are shown within the layout */}
                    <RouteErrorBoundary>
                        <Suspense fallback={<PageLoading />}>
                            <Outlet />
                        </Suspense>
                    </RouteErrorBoundary>
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
        </ChatPageProvider>
    );
}

// Shown while a module's navigation data is loading
function NavigationSkeleton() {
    return (
        <Box sx={{ px: 2, py: 1 }}>
            {[0, 1, 2].map((index) => (
                <Skeleton key={index} height={40} />
            ))}
        </Box>
    );
}
