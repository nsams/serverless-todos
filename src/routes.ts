import { index, layout, route, type RouteConfig, type RouteConfigEntry } from "@react-router/dev/routes";

// The routes of the modules (src/modules/<module>/routes.ts, route modules in its routes/ folder): a new module's routes are picked up
const moduleRoutes = Object.values(import.meta.glob<RouteConfigEntry[]>("./modules/*/routes.ts", { eager: true, import: "default" }));

// Route config (React Router framework mode): the core routes in src/routes/, the routes of each module from its own folder, mounted
// into the app layout. Paths are relative to src/.
export default [
    index("routes/index.tsx"),
    // the modules' operations for the UI (useOperations, src/modules/client.ts)
    route("api/:module/:operation", "routes/api.ts"),
    // its loader data is read by useNavigationData (src/modules/client.ts)
    layout("routes/_app.tsx", moduleRoutes.flat()),
] satisfies RouteConfig;
