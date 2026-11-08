import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAI } from "agents/models/ai-sdk";

// The model of the chat assistant: a Workers AI model (AI_MODEL, "@cf/..."), run by Cloudflare and billed through the Cloudflare account
// (no provider API key). Requests go through the AI Gateway AI_GATEWAY_ID (logs, spend and rate limits).
export function getChatModel(env: Env) {
    if (import.meta.env.DEV) {
        // The AI binding is remote-only: in development the model is called through the AI Gateway REST API (OpenAI-compatible),
        // forwarded by the dev server, which adds the account and the API token (cloudflareAiDevProxy.ts)
        const gateway = createOpenAICompatible({
            name: "cloudflare-ai-gateway",
            baseURL: `http://localhost:${env.APP_PORT}/__cloudflare-ai/v1`,
            headers: { "cf-aig-gateway-id": env.AI_GATEWAY_ID },
        });
        return gateway.chatModel(env.AI_MODEL);
    }
    return createAI({ binding: env.AI, id: env.AI_GATEWAY_ID })(env.AI_MODEL);
}
