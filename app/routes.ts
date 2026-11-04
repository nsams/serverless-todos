import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
    index("routes/todos.tsx"),
    route("todos/list", "routes/todos.list.ts"),
    route("login", "routes/login.ts"),
    route("auth/callback", "routes/auth.callback.ts"),
    route("logout", "routes/logout.ts"),
] satisfies RouteConfig;
