import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import type { Plugin } from "vite";

// Development only: forwards the chat assistant's model requests (src/chat/model.server.ts) to the AI Gateway REST API
// (https://developers.cloudflare.com/ai-gateway/usage/rest-api/).
//
// The AI binding is remote-only (it would need `wrangler login` and a remote proxy session), and the Workers runtime (workerd) ignores
// HTTP(S)_PROXY. Node's fetch uses it (NODE_USE_ENV_PROXY), so requests sent from here also work in sandboxes whose egress proxy injects
// the API token, like Claude Code on the web.
//
// Env: CLOUDFLARE_AI_ACCOUNT_ID (.env), CLOUDFLARE_AI_API_TOKEN (.env.local; permission Account > Workers AI > Read; any value if a proxy injects it)

export const cloudflareAiDevProxyPath = "/__cloudflare-ai";

// only the model endpoints, so this isn't a general purpose proxy with the developer's token
const allowedPaths = new Set(["/v1/chat/completions"]);

export function cloudflareAiDevProxy(): Plugin {
    return {
        name: "cloudflare-ai-dev-proxy",
        apply: "serve",
        configureServer(server) {
            server.middlewares.use(cloudflareAiDevProxyPath, (request, response) => {
                void (async () => {
                    const path = request.url?.split("?")[0] ?? "";
                    if (request.method !== "POST" || !allowedPaths.has(path)) {
                        response.writeHead(404).end();
                        return;
                    }
                    const accountId = process.env.CLOUDFLARE_AI_ACCOUNT_ID;
                    if (!accountId) {
                        response.writeHead(500, { "content-type": "text/plain" }).end("CLOUDFLARE_AI_ACCOUNT_ID is not set (.env)");
                        return;
                    }
                    try {
                        const upstream = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai${path}`, {
                            method: "POST",
                            headers: {
                                "content-type": request.headers["content-type"] ?? "application/json",
                                // replaced by the egress proxy where it injects the token
                                authorization: `Bearer ${process.env.CLOUDFLARE_AI_API_TOKEN ?? "missing-CLOUDFLARE_AI_API_TOKEN"}`,
                                ...(typeof request.headers["cf-aig-gateway-id"] === "string" && {
                                    "cf-aig-gateway-id": request.headers["cf-aig-gateway-id"],
                                }),
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
                        server.config.logger.error(`[cloudflare-ai-dev-proxy] ${message}`);
                        if (!response.headersSent) {
                            response.writeHead(502, { "content-type": "text/plain" });
                        }
                        response.end(`AI Gateway request failed: ${message}`);
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
