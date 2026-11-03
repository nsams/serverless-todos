import { handleCallback } from "~/auth.server";

import type { Route } from "./+types/auth.callback";

export function loader({ request }: Route.LoaderArgs) {
    return handleCallback(request);
}
