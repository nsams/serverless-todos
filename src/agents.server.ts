// Forwarding requests to the app's Agents (Durable Objects of the Agents SDK: the chat agent, the drafts)

// Forwards an authenticated request (HTTP or WebSocket upgrade) to an agent instance the worker chose. The client's request must not
// be able to steer the Agents SDK: its internal headers (x-cf-agents-*, e.g. the sub-agent URL, which would make the agent run a
// sub-agent of any name, i.e. as any user) are removed, and sub-agent paths (/sub/<class>/<name>) are rejected (the app has no
// sub-agents). headers: set on the forwarded request (e.g. the authenticated user).
export function forwardToAgent(agent: { fetch(request: Request): Promise<Response> }, request: Request, headers?: Record<string, string>) {
    if (new URL(request.url).pathname.split("/").includes("sub")) {
        return Promise.resolve(new Response("Not found", { status: 404 }));
    }
    const forwarded = new Headers(request.headers);
    for (const name of [...forwarded.keys()]) {
        if (name.toLowerCase().startsWith("x-cf-agents-")) {
            forwarded.delete(name);
        }
    }
    for (const [name, value] of Object.entries(headers ?? {})) {
        forwarded.set(name, value);
    }
    return agent.fetch(new Request(request, { headers: forwarded }));
}

// The app's agents have no sub-agents: their onBeforeSubAgent (defense in depth, besides forwardToAgent)
export async function denySubAgent() {
    return new Response("Not found", { status: 404 });
}
