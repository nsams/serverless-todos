import { createContext } from "react-router";

import type { User } from "./auth.server";

// Request context of the loaders, actions and middleware (React Router's RouterContextProvider)

// Cloudflare Access (`ctx.access`, set by the runtime on requests that matched an Access application), passed in by the worker entry (src/server.ts)
export const accessContext = createContext<CloudflareAccessContext | undefined>(undefined);

// The authenticated user, set by the auth middleware of the root route (src/root.tsx)
export const userContext = createContext<User>();
