import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import type { Plugin } from "vite";

// Development on the Cloudflare platform only: forwards the chat assistant's model requests (src/chat/model.server.ts) to the model's API
// (AI_BASE_URL) with the API key (AI_API_KEY).
//
// The Workers runtime (workerd) ignores HTTP(S)_PROXY, Node's fetch uses it (NODE_USE_ENV_PROXY): requests sent from here also work in
// sandboxes whose egress proxy injects the API key, like Claude Code on the web. On the bunny.net platform (`npm run dev:bunny`, in
// Node) the server sends the requests itself.

export const aiDevProxyPath = "/__ai";

// only the model endpoint, so this isn't a general purpose proxy with the developer's API key
const allowedPaths = new Set(["/chat/completions"]);

export function aiDevProxy(): Plugin {
    return {
        name: "ai-dev-proxy",
        apply: "serve",
        configureServer(server) {
            server.middlewares.use(aiDevProxyPath, (request, response) => {
                void (async () => {
                    const path = request.url?.split("?")[0] ?? "";
                    if (request.method !== "POST" || !allowedPaths.has(path)) {
                        response.writeHead(404).end();
                        return;
                    }
                    const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
                    try {
                        const upstream = await fetch(`${baseUrl}${path}`, {
                            method: "POST",
                            headers: {
                                "content-type": request.headers["content-type"] ?? "application/json",
                                // replaced by the egress proxy where it injects the API key
                                authorization: `Bearer ${process.env.AI_API_KEY ?? "missing-AI_API_KEY"}`,
                            },
                            body: await readBody(request),
                        });
                        response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" });
                        if (upstream.body) {
                            Readable.fromWeb(upstream.body).pipe(response);
                        } else {
                            response.end();
                        }
                    } catch (error) {
                        // fetch errors carry the reason (e.g. a proxy denying the host) in `cause`
                        const message =
                            error instanceof Error && error.cause !== undefined ? `${String(error)}: ${String(error.cause)}` : String(error);
                        server.config.logger.error(`[ai-dev-proxy] ${message}`);
                        if (!response.headersSent) {
                            response.writeHead(502, { "content-type": "text/plain" });
                        }
                        response.end(`Model request failed: ${message}`);
                    }
                })();
            });
        },
    };
}

async function readBody(request: IncomingMessage) {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
}
