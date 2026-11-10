import type { Config } from "@react-router/dev/config";

export default {
    // the app's sources (root route src/root.tsx, route config src/routes.ts)
    appDirectory: "src",
    // server rendering in the worker (src/server.ts)
    ssr: true,
} satisfies Config;
