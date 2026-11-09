import { replace } from "react-router";

import { startPath } from "~/modules/registry";

// Start page: redirects to the start page of a module
export function loader() {
    throw replace(startPath);
}
