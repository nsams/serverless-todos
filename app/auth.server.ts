import { env } from "cloudflare:workers";
import * as oidc from "openid-client";
import { createCookieSessionStorage, redirect } from "react-router";

type User = { id: string; name: string; email: string };

type SessionData = { user: User; idToken: string };
type SessionFlashData = { codeVerifier: string; state: string };

const sessionStorage = createCookieSessionStorage<SessionData, SessionFlashData>({
    cookie: {
        name: "__session",
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secrets: [env.SESSION_SECRET],
        secure: import.meta.env.PROD,
        maxAge: 60 * 60 * 24 * 7,
    },
});

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

function getSession(request: Request) {
    return sessionStorage.getSession(request.headers.get("Cookie"));
}

export async function getUser(request: Request) {
    const session = await getSession(request);
    return session.get("user");
}

export async function requireUser(request: Request) {
    const user = await getUser(request);
    if (!user) {
        throw redirect("/login");
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

    const session = await getSession(request);
    session.flash("codeVerifier", codeVerifier);
    session.flash("state", state);
    return redirect(authorizationUrl.href, { headers: { "Set-Cookie": await sessionStorage.commitSession(session) } });
}

export async function handleCallback(request: Request) {
    const config = await getOidcConfig();
    const session = await getSession(request);
    const tokens = await oidc.authorizationCodeGrant(config, new URL(request.url), {
        pkceCodeVerifier: session.get("codeVerifier"),
        expectedState: session.get("state"),
    });
    const claims = tokens.claims();
    if (!claims || !tokens.id_token) {
        throw new Error("No ID token received");
    }

    session.set("user", { id: claims.sub, name: String(claims.name ?? claims.sub), email: String(claims.email ?? "") });
    session.set("idToken", tokens.id_token);
    return redirect("/", { headers: { "Set-Cookie": await sessionStorage.commitSession(session) } });
}

export async function logout(request: Request) {
    const config = await getOidcConfig();
    const session = await getSession(request);
    const idToken = session.get("idToken");
    const endSessionUrl = oidc.buildEndSessionUrl(config, {
        post_logout_redirect_uri: new URL("/", request.url).href,
        ...(idToken && { id_token_hint: idToken }),
    });
    return redirect(endSessionUrl.href, { headers: { "Set-Cookie": await sessionStorage.destroySession(session) } });
}
