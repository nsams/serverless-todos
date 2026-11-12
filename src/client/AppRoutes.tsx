import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigationType } from "react-router";

import { ChatPageProvider } from "~/chat/useChatPage";
import { appModules, startPath } from "~/modules/registry";

import { AppLayout } from "./AppLayout";
import { NotFoundPage, PageErrorBoundary } from "./errors";

// The routes of the app (React Router, declarative mode, inside the BrowserRouter of main.tsx): the start page, and the pages of the
// modules (AppModule.pages) in the app layout. The pages load their data from the REST API themselves, with queries (TanStack Query).
// The pages report what they show to the chat panel (useChatPage).
export function AppRoutes() {
    return (
        // errors outside the pages, e.g. the user or the sidebar's data failed to load; errors of the pages are shown in the app layout
        <PageErrorBoundary>
            <ScrollToTop />
            <ChatPageProvider>
                <Routes>
                    {/* start page: redirects to the start page of a module */}
                    <Route index element={<Navigate to={startPath} replace />} />
                    <Route element={<AppLayout />}>
                        {appModules
                            .flatMap((module) => module.pages)
                            .map(({ path, Component }) => (
                                <Route key={path} path={path} element={<Component />} />
                            ))}
                        <Route path="*" element={<NotFoundPage />} />
                    </Route>
                </Routes>
            </ChatPageProvider>
        </PageErrorBoundary>
    );
}

// A new page starts at the top. Not when only the search params change (e.g. the grid's page), and not on back/forward,
// where the browser restores the scroll position (the previous data is still in the query cache, so the page renders right away).
function ScrollToTop() {
    const { pathname } = useLocation();
    const navigationType = useNavigationType();
    useEffect(() => {
        if (navigationType !== "POP") {
            window.scrollTo(0, 0);
        }
    }, [pathname, navigationType]);
    return null;
}
