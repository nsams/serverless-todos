import { Dialog } from "@base-ui/react/dialog";
import { Icon, IconButton, MenuSectionHeader, Spinner, Typography } from "@dextinity/ui";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { lazy, Suspense, useState } from "react";
import { Outlet } from "react-router";

import { userClient } from "~/api/client";
import { appName } from "~/app";
import { IconButtonLink } from "~/components/ui/IconButtonLink";
import layout from "~/components/ui/layout.module.css";
import { appModules } from "~/modules/registry";

import styles from "./AppLayout.module.css";
import { PageErrorBoundary, PageLoading } from "./errors";

// Layout of the app pages: app bar and the navigation of the modules in a sidebar. The layout stays mounted while navigating
// between the pages, so its data (the user, the sidebar's data loaded by the modules' navigation components) isn't reloaded by
// navigations, only when its queries are invalidated (e.g. after creating a list).

const userQuery = queryOptions({
    queryKey: ["user"],
    queryFn: () => parseResponse(userClient.user.$get()),
    // doesn't change while the app is open
    staleTime: Infinity,
});

// loaded on first open: the chat (MUI X Chat, Agents SDK client) is a large part of the app's code
const ChatPanel = lazy(() => import("~/components/ChatPanel"));

export function AppLayout() {
    // shown once loaded, the layout doesn't wait for it
    const { data: user } = useQuery(userQuery);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    // stays mounted once opened, so the conversation (and a running answer) survives closing the panel
    const [chatMounted, setChatMounted] = useState(false);

    const toggleChat = () => {
        setChatMounted(true);
        setChatOpen((open) => !open);
    };

    const navigation = appModules.map(
        ({ id, navigation }) =>
            navigation && (
                <section key={id} className={styles.navigationSection}>
                    <MenuSectionHeader slots={{ label: "h2" }}>{navigation.title}</MenuSectionHeader>
                    <navigation.Component onNavigate={() => setMobileDrawerOpen(false)} />
                </section>
            ),
    );

    return (
        <div className={styles.root}>
            <header className={styles.appBar}>
                <IconButton
                    variant="text"
                    color="secondary"
                    aria-label="Open navigation"
                    onClick={() => setMobileDrawerOpen(true)}
                    className={styles.menuButton}
                >
                    <Icon name="hamburger" />
                </IconButton>
                <Typography variant="h3" element="span" className={layout.grow}>
                    {appName}
                </Typography>
                <Typography variant="bodyS" element="span" className={styles.user}>
                    {user?.email}
                </Typography>
                <IconButton variant="text" color="secondary" aria-label="Assistant" aria-pressed={chatOpen} onClick={toggleChat}>
                    <Icon name="chatbot" />
                </IconButton>
                {/* handled by Cloudflare Access, so a full page load */}
                <IconButtonLink variant="text" color="secondary" aria-label="Logout" render={<a href="/cdn-cgi/access/logout" />}>
                    <Icon name="logout" />
                </IconButtonLink>
            </header>
            {/* wide screens: always shown */}
            <nav className={styles.sidebar} aria-label="Navigation">
                {navigation}
            </nav>
            {/* small screens: a drawer opened by the menu button */}
            <Dialog.Root open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
                <Dialog.Portal>
                    <Dialog.Backdrop className={styles.drawerBackdrop} />
                    <Dialog.Popup className={styles.drawer}>
                        <nav aria-label="Navigation">{navigation}</nav>
                    </Dialog.Popup>
                </Dialog.Portal>
            </Dialog.Root>
            {/* on wide screens the open chat takes space from the page instead of covering it */}
            <main className={styles.main} data-chat-open={chatOpen || undefined}>
                {/* errors of the pages (e.g. a list that doesn't exist (anymore)) are shown in the layout */}
                <PageErrorBoundary>
                    {/* while a page's code or data is loading for the first time (see usePageQuery) */}
                    <Suspense fallback={<PageLoading />}>
                        <Outlet />
                    </Suspense>
                </PageErrorBoundary>
            </main>
            <aside className={styles.chat} data-open={chatOpen || undefined} aria-label="Assistant">
                {chatMounted && (
                    <Suspense
                        fallback={
                            <div className={layout.loading}>
                                <Spinner size="lg" aria-label="Loading" />
                            </div>
                        }
                    >
                        <ChatPanel onClose={() => setChatOpen(false)} />
                    </Suspense>
                )}
            </aside>
        </div>
    );
}
