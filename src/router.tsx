import { Navigate, Route, Routes } from "react-router";

import { appPages, startPath } from "./modules/registry";
import { AppLayout } from "./routes/app";
import { NotFound, ScrollToTop } from "./routes/root";

// The app's routes (React Router declarative mode, <BrowserRouter> in src/main.tsx): the pages of the modules (AppModule.pages,
// src/modules/registry.ts) in the app layout. The pages load their data themselves with TanStack Query (src/api/client.ts).
export function AppRoutes() {
    return (
        <>
            <ScrollToTop />
            <Routes>
                <Route path="/" element={<Navigate to={startPath} replace />} />
                <Route element={<AppLayout />}>
                    {appPages.map(({ route, Component }) => (
                        <Route key={route.path} path={route.path} element={<Component />} />
                    ))}
                    <Route path="*" element={<NotFound />} />
                </Route>
            </Routes>
        </>
    );
}
