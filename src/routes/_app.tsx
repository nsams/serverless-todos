import { Chatbot, Hamburger, Logout } from "@dextinity/admin-icons";
import { AppBar, Box, CircularProgress, Divider, Drawer, IconButton, ListSubheader, Toolbar, Typography } from "@mui/material";
import { Fragment, lazy, Suspense, useState } from "react";
import { Outlet, type ShouldRevalidateFunctionArgs } from "react-router";

import { appName } from "~/app";
import { ChatPageProvider } from "~/chat/useChatPage";
import { userContext } from "~/context";
import { appModules } from "~/modules/registry";
import { loadNavigationData } from "~/modules/registry.server";

import type { Route } from "./+types/_app";

// Layout of the app pages: app bar and the navigation of the modules in a sidebar
export async function loader({ context }: Route.LoaderArgs) {
    const user = context.get(userContext);
    return { user, navigation: await loadNavigationData({ userId: user.id }) };
}

// Reloaded when React Router would reload it: after every change (e.g. the new list in the sidebar; not after changes that opt out, e.g.
// autosaving a note, see useOperations), explicit reloads (useRevalidator, e.g. after the chat assistant changed something) and redirects
// while reloading (e.g. a moved note). But not when only the search params change (React Router reloads all loaders then), e.g. on every
// change of a grid's state.
export function shouldRevalidate({ formMethod, currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
    return defaultShouldRevalidate && (formMethod !== undefined || currentUrl.search === nextUrl.search);
}

const drawerWidth = 260;
const chatWidth = 420;

// loaded on first open: the chat (MUI X Chat, Agents SDK client) is only needed in the browser
const ChatPanel = lazy(() => import("~/components/ChatPanel"));

export default function AppLayout({ loaderData: { user } }: Route.ComponentProps) {
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
        // the page shown, reported by the pages (useChatPage) and sent by the chat with every message
        <ChatPageProvider>
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
        </ChatPageProvider>
    );
}
