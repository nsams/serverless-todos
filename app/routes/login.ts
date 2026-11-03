import { login } from "~/auth.server";

import type { Route } from "./+types/login";

export function loader({ request }: Route.LoaderArgs) {
    return login(request);
}
