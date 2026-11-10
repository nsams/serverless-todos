import { Generator, getConfig } from "@tanstack/router-generator";

// Generates src/routeTree.gen.ts (`npm run lint:tsc`), like the TanStack Start Vite plugin does on dev and build: tsc then checks the
// current route files, not a stale route tree (e.g. after renaming a route file without starting the dev server).
// Same config as the plugin (tsr.config.json); the footer is the one the plugin adds (registers the router and src/start.ts with Start).

const footer = `import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}`;

const root = process.cwd();
await new Generator({ config: getConfig({ target: "react", routeTreeFileFooter: [footer] }, root), root }).run();
