import { Navigate, Route, Routes } from "react-router";

import { appModules, startPath } from "./modules/registry";
import { AppLayout } from "./routes/app";
import { NotFound, ScrollToTop } from "./routes/root";

// The app's routes (React Router declarative mode, <BrowserRouter> in src/main.tsx): the pages of the modules (AppModule.routes,
// created with defineRoute, src/routing.tsx) in the app layout. Each page loads its data with TanStack Query (src/api/client.ts).
export function AppRoutes() {
    return (
        <>
            <ScrollToTop />
            <Routes>
                <Route path="/" element={<Navigate to={startPath} replace />} />
                <Route element={<AppLayout />}>
                    {appModules
                        .flatMap(({ routes }) => routes)
                        .map(({ path, Component }) => (
                            <Route key={path} path={path} element={<Component />} />
                        ))}
                    <Route path="*" element={<NotFound />} />
                </Route>
            </Routes>
        </>
    );
}
