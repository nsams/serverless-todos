import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { getEnv, getPlatform } from "~/platform/platform.server";

// The model of the chat assistant: any provider with an OpenAI-compatible Chat Completions API and function calling (OpenAI, Azure OpenAI,
// Mistral, OpenRouter, ...), configured by environment variables:
//
// - AI_API_KEY (secret): without it the chat assistant is not available (no chat button, the endpoint answers 503)
// - AI_BASE_URL: the API's base URL, default https://api.openai.com/v1 (e.g. https://<resource>.openai.azure.com/openai/v1)
// - AI_MODEL: the model (Azure: the deployment name), default gpt-5-mini

const defaultBaseUrl = "https://api.openai.com/v1";
const defaultModel = "gpt-5-mini";

export function isChatEnabled() {
    return getEnv("AI_API_KEY") !== undefined;
}

// undefined if the chat assistant isn't configured (no AI_API_KEY)
export function getChatModel() {
    const apiKey = getEnv("AI_API_KEY");
    if (!apiKey) {
        return undefined;
    }
    const model = getEnv("AI_MODEL") ?? defaultModel;
    if (import.meta.env.DEV && getPlatform().name === "cloudflare") {
        // The Workers runtime (workerd) ignores HTTP(S)_PROXY: in development the requests are sent from the dev server (Node), which
        // adds the API key (aiDevProxy.ts). So the chat also works in sandboxes whose egress proxy injects the API key.
        return createOpenAICompatible({ name: "ai", baseURL: `http://localhost:${getEnv("APP_PORT")}/__ai` }).chatModel(model);
    }
    return createOpenAICompatible({ name: "ai", baseURL: getEnv("AI_BASE_URL") ?? defaultBaseUrl, apiKey }).chatModel(model);
}
