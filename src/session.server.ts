import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

// Minimal signed (not encrypted) cookie storage: base64url(JSON) + "." + base64url(HMAC-SHA256)

type CookieOptions = NonNullable<Parameters<typeof setCookie>[2]>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let key: Promise<CryptoKey> | undefined;

function getKey() {
    key ??= crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    return key;
}

function toBase64Url(bytes: Uint8Array) {
    return btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
}

function fromBase64Url(value: string) {
    return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
}

export async function getSignedCookie<T>(name: string): Promise<T | undefined> {
    const cookie = getCookie(name);
    const [payload, signature] = cookie?.split(".") ?? [];
    if (!payload || !signature) {
        return undefined;
    }
    try {
        if (!(await crypto.subtle.verify("HMAC", await getKey(), fromBase64Url(signature), encoder.encode(payload)))) {
            return undefined;
        }
        const { data, expires } = JSON.parse(decoder.decode(fromBase64Url(payload))) as { data: T; expires: number };
        return expires > Date.now() ? data : undefined;
    } catch {
        // malformed cookie
        return undefined;
    }
}

export async function setSignedCookie(name: string, data: unknown, options: CookieOptions & { maxAge: number }) {
    const payload = toBase64Url(encoder.encode(JSON.stringify({ data, expires: Date.now() + options.maxAge * 1000 })));
    const signature = toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", await getKey(), encoder.encode(payload))));
    setCookie(name, `${payload}.${signature}`, options);
}

export function deleteSignedCookie(name: string, options: CookieOptions) {
    deleteCookie(name, options);
}
