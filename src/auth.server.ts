import { redirect } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import * as oidc from "openid-client";

import { deleteSignedCookie, getSignedCookie, setSignedCookie } from "./session.server";

export type User = { id: string; name: string; email: string };

type SessionData = { user: User; idToken: string };
type LoginData = { codeVerifier: string; state: string };

const sessionCookie = "__session";
// short-lived, only during the login flow
const loginCookie = "__login";

const cookieOptions = {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: import.meta.env.PROD,
} as const;

let oidcConfig: oidc.Configuration | undefined;

async function getOidcConfig() {
    if (!oidcConfig) {
        const issuer = new URL(env.OIDC_ISSUER);
        oidcConfig = await oidc.discovery(issuer, env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET, oidc.ClientSecretPost(env.OIDC_CLIENT_SECRET), {
            // dev-oidc-provider runs on http
            execute: issuer.protocol === "http:" ? [oidc.allowInsecureRequests] : [],
        });
    }
    return oidcConfig;
}

export async function getUser() {
    const session = await getSignedCookie<SessionData>(sessionCookie);
    return session?.user;
}

export async function requireUser() {
    const user = await getUser();
    if (!user) {
        // /login is a server route, so it needs a full page load
        throw redirect({ href: "/login", reloadDocument: true });
    }
    return user;
}

export async function login(request: Request) {
    const config = await getOidcConfig();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const authorizationUrl = oidc.buildAuthorizationUrl(config, {
        redirect_uri: new URL("/auth/callback", request.url).href,
        scope: "openid profile email",
        code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: "S256",
        state,
    });

    await setSignedCookie(loginCookie, { codeVerifier, state } satisfies LoginData, { ...cookieOptions, maxAge: 60 * 10 });
    return redirect({ href: authorizationUrl.href, statusCode: 302 });
}

export async function handleCallback(request: Request) {
    const config = await getOidcConfig();
    const loginData = await getSignedCookie<LoginData>(loginCookie);
    deleteSignedCookie(loginCookie, cookieOptions);
    const tokens = await oidc.authorizationCodeGrant(config, new URL(request.url), {
        pkceCodeVerifier: loginData?.codeVerifier,
        expectedState: loginData?.state,
    });
    const claims = tokens.claims();
    if (!claims || !tokens.id_token) {
        throw new Error("No ID token received");
    }

    const session: SessionData = {
        user: { id: claims.sub, name: String(claims.name ?? claims.sub), email: String(claims.email ?? "") },
        idToken: tokens.id_token,
    };
    await setSignedCookie(sessionCookie, session, { ...cookieOptions, maxAge: 60 * 60 * 24 * 7 });
    return redirect({ href: "/", statusCode: 302 });
}

export async function logout(request: Request) {
    const config = await getOidcConfig();
    const session = await getSignedCookie<SessionData>(sessionCookie);
    deleteSignedCookie(sessionCookie, cookieOptions);
    const endSessionUrl = oidc.buildEndSessionUrl(config, {
        post_logout_redirect_uri: new URL("/", request.url).href,
        ...(session && { id_token_hint: session.idToken }),
    });
    // 302 (not the default 307): the browser must not repeat the POST at the IdP
    return redirect({ href: endSessionUrl.href, statusCode: 302 });
}
