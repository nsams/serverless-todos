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
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Fragment, lazy, Suspense, useState } from "react";

import { appName } from "~/app";
import { appModules } from "~/modules/registry";
import { getAppSession } from "~/user.functions";

// Layout of the app pages: app bar and the navigation of the modules in a sidebar
export const Route = createFileRoute("/_app")({
    // The app's pages are rendered in the browser only, their data is still loaded on the server (in the same request, sent with the
    // page). An app behind a login gains nothing from rendering them on the server (no search engines, the user waits for the
    // scripts anyway), it would only cost CPU time per page view and need hydration-safe components: e.g. dates formatted in the
    // user's time zone (the grids' date columns, useToday) would differ between the server and the browser.
    ssr: "data-only",
    loader: async ({ context: { queryClient }, cause }) => {
        // Not awaited: the page doesn't wait for the sidebar, each module's navigation is shown when its data is there. Only when the
        // app is opened: then the navigation queries keep themselves up to date (reloaded with their module's data, or when stale and
        // shown again), so the loaders running again (e.g. after a change in one module) don't reload every module's navigation.
        if (cause === "enter") {
            for (const { navigation } of appModules) {
                void navigation?.prefetch(queryClient);
            }
        }
        await queryClient.ensureQueryData(sessionQuery);
    },
    component: AppLayout,
    // the server's response, until the page is rendered in the browser
    pendingComponent: () => <LinearProgress />,
});

// The authenticated user, the logout and whether the chat assistant is available (don't change while the app is open)
const sessionQuery = queryOptions({ queryKey: ["session"], queryFn: () => getAppSession(), staleTime: Infinity });

const drawerWidth = 260;
const chatWidth = 420;

// loaded on first open: the chat (MUI X Chat, AI SDK client) is only needed in the browser
const ChatPanel = lazy(() => import("~/components/ChatPanel"));

function AppLayout() {
    const {
        data: { user, logoutPath, chatEnabled },
    } = useSuspenseQuery(sessionQuery);
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
                    {/* only with an API key for the model (src/chat/model.server.ts) */}
                    {chatEnabled && (
                        <IconButton color="inherit" aria-label="Assistant" aria-pressed={chatOpen} onClick={toggleChat}>
                            <Chatbot />
                        </IconButton>
                    )}
                    {/* handled by Cloudflare Access or the app's own login (src/platform/), so a full page load */}
                    <IconButton href={logoutPath} color="inherit" aria-label="Logout">
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
