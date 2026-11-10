// Name of the app (page titles, app bar, MCP server)
export const appName = "Todos";

// The head of a page (route option `head`): its title, e.g. the name of the list shown (undefined while loading)
export function pageHead(title: string | undefined) {
    return { meta: [{ title: title ? `${title} – ${appName}` : appName }] };
}
