import { logout } from "~/auth.server";

import type { Route } from "./+types/logout";

export function action({ request }: Route.ActionArgs) {
    return logout(request);
}
