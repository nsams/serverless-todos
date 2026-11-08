import { createFileRoute, redirect } from "@tanstack/react-router";

import { startPath } from "~/modules/registry";

// Start page: redirects to the start page of a module
export const Route = createFileRoute("/")({
    beforeLoad: () => {
        throw redirect({ to: startPath, replace: true });
    },
});
