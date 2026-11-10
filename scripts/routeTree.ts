import { Generator, getConfig } from "@tanstack/router-generator";

// Generates src/routeTree.gen.ts (`npm run lint:tsc`), like the router's Vite plugin does on dev and build: tsc then checks the current
// route files, not a stale route tree (e.g. after renaming a route file without starting the dev server). Same config as the plugin
// (tsr.config.json).
const root = process.cwd();
await new Generator({ config: getConfig({ target: "react" }, root), root }).run();
