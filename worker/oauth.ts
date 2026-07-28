/**
 * The authorization server: `/oauth/*` and the OAuth well-known documents.
 *
 * Same split as everything else in this Worker. The decisions live in
 * `src/lib/mcp/consent.ts` (who may be issued a credential, how the in-flight
 * request survives the trip to GitHub, what the human is shown); this file
 * does the IO those decisions need, which is three GitHub calls and three
 * calls into `@cloudflare/workers-oauth-provider`.
 *
 * ## Who plays which role
 *
 * aboard is the authorization server. GitHub is the identity provider behind
 * it, and only that. GitHub cannot be the authorization server directly: it
 * supports neither Dynamic Client Registration nor Client ID Metadata
 * Documents, so an arbitrary MCP client has no way to obtain a `client_id`,
 * and it has no resource indicators, so its tokens are issued for a GitHub
 * OAuth App rather than for `https://aboard.untype.me/mcp`. Accepting one of
 * those would be the audience-validation failure the MCP spec forbids with a
 * MUST. So GitHub tells us *who the human is*, and we issue our own token
 * bound to our own resource.
 *
 * The pull requests are still opened by aboard's own fine-grained PAT. A
 * GitHub login here establishes identity for provenance; it does not act on
 * the user's behalf. Opening PRs as the user is a different design with a fork
 * story behind it.
 *
 * ## Why `/mcp` is not an `apiRoute`
 *
 * The provider 401s an `apiRoute` request that carries no bearer token, before
 * the handler runs. `/mcp` must serve anonymous reads, so it stays on the
 * default handler and validates tokens itself through
 * `env.OAUTH_PROVIDER.unwrapToken`. The constructor still demands some API
 * route, so `GET /api/whoami` is one: an endpoint an agent wants anyway, to
 * check what a credential resolves to before spending a write finding out.
 */
import { OAuthProvider, type AuthRequest } from "@cloudflare/workers-oauth-provider";
import { CANONICAL_ORIGIN } from "../src/lib/site";
import { PROPOSE_SCOPE, RESOURCE_URI } from "../src/lib/mcp/auth";
import {
  consentPage,
  loginAllowed,
  oauthSubject,
  openState,
  refusedPage,
  sealState,
  type ConsentState,
} from "../src/lib/mcp/consent";

/** The GitHub OAuth App behind the login step. `read:user` and nothing more:
 *  we need a login and a stable id, never repository access. */
const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";
const GITHUB_USER = "https://api.github.com/user";
const GITHUB_SCOPE = "read:user";

/** Enough of an execution context for what this file reads off it. The
 *  project has no `@cloudflare/workers-types` dependency and does not need one
 *  for three fields. */
export type ExecCtx = { props?: Record<string, unknown> };

export type OAuthEnv = {
  /** The provider's storage. Its presence is what "OAuth is configured" means
   *  to the rest of the Worker. */
  OAUTH_KV?: unknown;
  OAUTH_PROVIDER?: OAuthHelpers;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  /** HMAC key for the sealed consent state. */
  ABOARD_OAUTH_STATE_SECRET?: string;
  /** Comma-separated GitHub logins. Empty or unset means open. */
  ABOARD_OAUTH_ALLOWED_LOGINS?: string;
};

/** The provider helpers, narrowed to what this file calls. */
type OAuthHelpers = {
  parseAuthRequest: (request: Request) => Promise<AuthRequest>;
  lookupClient: (clientId: string) => Promise<{ clientName?: string } | null>;
  completeAuthorization: (options: {
    request: AuthRequest;
    userId: string;
    metadata: Record<string, unknown>;
    scope: string[];
    props: Record<string, unknown>;
  }) => Promise<{ redirectTo: string }>;
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  // A consent screen is per-request and carries a signed state. Nothing about
  // it may be reused, by a cache or by a back button.
  "cache-control": "no-store",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: HTML_HEADERS });
}

/** A plain-text failure. The consent flow is read by humans, not agents, so
 *  it does not use the JSON error envelope the API endpoints use. */
function oops(message: string, status: number): Response {
  return new Response(`${message}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Every secret the flow needs, or null when the deployment has no OAuth
 *  configured. Keeps the "degrade rather than half-work" posture explicit. */
function config(env: OAuthEnv) {
  const { GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET, ABOARD_OAUTH_STATE_SECRET } = env;
  if (!GITHUB_OAUTH_CLIENT_ID || !GITHUB_OAUTH_CLIENT_SECRET || !ABOARD_OAUTH_STATE_SECRET) {
    return null;
  }
  return {
    clientId: GITHUB_OAUTH_CLIENT_ID,
    clientSecret: GITHUB_OAUTH_CLIENT_SECRET,
    stateSecret: ABOARD_OAUTH_STATE_SECRET,
  };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// --- leg 1: the client arrives ---------------------------------------------

/**
 * `GET /oauth/authorize`.
 *
 * The provider parses and validates the OAuth request (client, redirect URI,
 * PKCE, resource) and hands back a structured `AuthRequest`. We seal it and
 * send the human to GitHub. Nothing is stored: the sealed state is the whole
 * of the server's memory of this flow.
 */
async function startAuthorization(request: Request, env: OAuthEnv): Promise<Response> {
  const settings = config(env);
  if (!settings || !env.OAUTH_PROVIDER) {
    return oops("This deployment has no OAuth configured.", 503);
  }

  let authRequest: AuthRequest;
  try {
    authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch {
    return oops("That is not a valid authorization request.", 400);
  }

  // The only scope this server issues. Asking for more is not an error worth
  // failing on: the grant is narrowed to what we have, and the client is told
  // what it got in the token response.
  const state: ConsentState = {
    authRequest: authRequest as unknown as Record<string, unknown>,
    issuedAt: nowSeconds(),
  };

  const url = new URL(GITHUB_AUTHORIZE);
  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", `${CANONICAL_ORIGIN}/oauth/callback`);
  url.searchParams.set("scope", GITHUB_SCOPE);
  url.searchParams.set("state", await sealState(state, settings.stateSecret));
  url.searchParams.set("allow_signup", "false");

  return Response.redirect(url.toString(), 302);
}

// --- leg 2: GitHub sends the human back ------------------------------------

type GitHubUser = { login: string; id: number };

/** Exchange GitHub's code for a token, then read the identity behind it. */
async function identifyViaGitHub(
  code: string,
  settings: { clientId: string; clientSecret: string },
): Promise<GitHubUser | null> {
  const tokenResponse = await fetch(GITHUB_TOKEN, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      code,
      redirect_uri: `${CANONICAL_ORIGIN}/oauth/callback`,
    }),
  });
  if (!tokenResponse.ok) return null;

  const token = (await tokenResponse.json().catch(() => null)) as {
    access_token?: string;
  } | null;
  if (!token?.access_token) return null;

  const userResponse = await fetch(GITHUB_USER, {
    headers: {
      authorization: `Bearer ${token.access_token}`,
      accept: "application/vnd.github+json",
      // GitHub rejects an API request with no User-Agent.
      "user-agent": "aboard-oauth",
    },
  });
  if (!userResponse.ok) return null;

  const user = (await userResponse.json().catch(() => null)) as Partial<GitHubUser> | null;
  if (!user?.login || typeof user.id !== "number") return null;

  return { login: user.login, id: user.id };
}

/**
 * `GET /oauth/callback`.
 *
 * Identifies the human, applies the allowlist, and renders consent. The
 * allowlist is applied here rather than at the token endpoint on purpose: a
 * refused login should never reach a code exchange, and the person deserves to
 * be told why while they are still looking at a page.
 */
async function completeGitHubLogin(request: Request, env: OAuthEnv): Promise<Response> {
  const settings = config(env);
  if (!settings) return oops("This deployment has no OAuth configured.", 503);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const sealed = url.searchParams.get("state");
  if (!code || !sealed) return oops("That callback is missing its code or state.", 400);

  const state = await openState(sealed, settings.stateSecret, nowSeconds());
  if (!state) {
    return oops("That sign-in link has expired or been tampered with. Start again.", 400);
  }

  const user = await identifyViaGitHub(code, settings);
  if (!user) return oops("GitHub did not confirm that sign-in.", 502);

  if (!loginAllowed(user.login, env.ABOARD_OAUTH_ALLOWED_LOGINS)) {
    return html(refusedPage(user.login), 403);
  }

  const authRequest = state.authRequest as unknown as AuthRequest;
  const client = await env.OAUTH_PROVIDER?.lookupClient(authRequest.clientId).catch(() => null);

  const clientName = client?.clientName || authRequest.clientId;

  const consentState: ConsentState = {
    authRequest: state.authRequest,
    login: user.login,
    userId: String(user.id),
    clientName,
    issuedAt: nowSeconds(),
  };

  return html(
    consentPage({
      clientName,
      redirectUri: authRequest.redirectUri,
      login: user.login,
      sealedState: await sealState(consentState, settings.stateSecret),
    }),
  );
}

// --- leg 3: the human decides ----------------------------------------------

/**
 * `POST /oauth/consent`.
 *
 * The identity in the sealed state was established by GitHub and signed by us,
 * so nothing here trusts the form beyond the decision itself. A denial is
 * answered with `access_denied` on the client's redirect URI, which is what
 * the client is waiting for, rather than a dead end in the browser.
 */
async function recordConsent(request: Request, env: OAuthEnv): Promise<Response> {
  const settings = config(env);
  if (!settings || !env.OAUTH_PROVIDER) {
    return oops("This deployment has no OAuth configured.", 503);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return oops("That consent submission was malformed.", 400);

  const sealed = String(form.get("state") ?? "");
  const state = await openState(sealed, settings.stateSecret, nowSeconds());
  if (!state?.login || !state.userId) {
    return oops("That consent form has expired. Start again.", 400);
  }

  const authRequest = state.authRequest as unknown as AuthRequest;

  if (String(form.get("decision")) !== "approve") {
    const denied = new URL(authRequest.redirectUri);
    denied.searchParams.set("error", "access_denied");
    denied.searchParams.set("error_description", "The user declined to authorize this client.");
    if (authRequest.state) denied.searchParams.set("state", authRequest.state);
    // RFC 9207 asks for `iss` on error responses too, so a client can tell
    // which server refused it.
    return Response.redirect(withIssuer(denied.toString()), 302);
  }

  // Re-check the allowlist at the moment of issuance. It could have been
  // tightened while this page sat open, and the sealed state is not a permit.
  if (!loginAllowed(state.login, env.ABOARD_OAUTH_ALLOWED_LOGINS)) {
    return html(refusedPage(state.login), 403);
  }

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: authRequest,
    // Never interpolate a colon here: the provider packs this into every code
    // and token as `${userId}:${grantId}:${random}` and parses by splitting on
    // ':'. See oauthSubject for the whole story.
    userId: oauthSubject(state.userId),
    metadata: { login: state.login, authorizedAt: new Date().toISOString() },
    // Narrowed to what this server issues, whatever was asked for.
    scope: [PROPOSE_SCOPE],
    // Read back by `resolveCredential` and stamped into every PR this
    // credential opens. A verified login, not a self-description.
    props: { login: state.login, clientName: state.clientName ?? authRequest.clientId },
  });

  return Response.redirect(withIssuer(redirectTo), 302);
}

/**
 * Add RFC 9207's `iss` to an authorization response.
 *
 * The provider does not emit it, and the `2026-07-28` revision says an
 * authorization server SHOULD, with a future revision expected to make it a
 * MUST. Adding it here is safe under the spec's own compatibility table: a
 * client that recorded our issuer compares it and is protected against a
 * mix-up attack, and a client that did not simply proceeds.
 *
 * We deliberately do not advertise `authorization_response_iss_parameter_supported`,
 * because that metadata document is the library's to generate and claiming
 * support we cannot guarantee across every response would be worse than
 * staying silent. Silence plus a present `iss` is the third row of that table,
 * and it is the row that still validates.
 */
function withIssuer(redirectTo: string): string {
  try {
    const url = new URL(redirectTo);
    url.searchParams.set("iss", CANONICAL_ORIGIN);
    return url.toString();
  } catch {
    return redirectTo;
  }
}

// --- routing ---------------------------------------------------------------

/** `GET /api/whoami`: what this credential resolves to. Reached only through
 *  the provider's `apiRoute`, so it is authenticated by construction. */
const whoamiHandler = {
  async fetch(request: Request, _env: unknown, ctx: ExecCtx): Promise<Response> {
    const props = (ctx.props ?? {}) as { login?: string; clientName?: string };
    return new Response(
      JSON.stringify(
        {
          authenticated: true,
          operator: props.login ?? null,
          client: props.clientName ?? null,
          scope: PROPOSE_SCOPE,
          resource: RESOURCE_URI,
        },
        null,
        2,
      ),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
    );
  },
};

/** The `/oauth/*` legs the provider does not implement itself. Everything else
 *  the provider sees falls through to aboard's own site handler. */
export function oauthUiHandler(siteHandler: {
  fetch: (request: Request, env: never, ctx: ExecCtx) => Promise<Response>;
}) {
  return {
    async fetch(request: Request, env: OAuthEnv, ctx: ExecCtx): Promise<Response> {
      const { pathname } = new URL(request.url);

      if (pathname === "/oauth/authorize" && request.method === "GET") {
        return startAuthorization(request, env);
      }
      if (pathname === "/oauth/callback" && request.method === "GET") {
        return completeGitHubLogin(request, env);
      }
      if (pathname === "/oauth/consent" && request.method === "POST") {
        return recordConsent(request, env);
      }
      if (pathname.startsWith("/oauth/")) {
        return oops("Not found.", 404);
      }

      return siteHandler.fetch(request, env as never, ctx);
    },
  };
}

/**
 * Wrap aboard's Worker in the authorization server.
 *
 * The provider handles the token, registration and metadata endpoints itself,
 * checks `apiRoute` second, and falls through to the default handler for
 * everything else with `env.OAUTH_PROVIDER` injected. That injection is what
 * lets `/mcp` validate tokens without being an `apiRoute`.
 */
export function withOAuth(siteHandler: {
  fetch: (request: Request, env: never, ctx: ExecCtx) => Promise<Response>;
}) {
  return new OAuthProvider({
    apiRoute: ["/api/whoami"],
    apiHandler: whoamiHandler,
    defaultHandler: oauthUiHandler(siteHandler),
    // Absolute rather than path-relative. The library resolves a bare path
    // against the inbound request URL, which makes `issuer` a function of how
    // the server was reached: behind wrangler dev that yields an http issuer,
    // and the spec requires every authorization server endpoint to be https.
    // Published metadata should not vary by route, and aboard has exactly one
    // canonical origin, so name it. Same reasoning as SERVER_INFO in
    // protocol.ts. Testing the flow locally means pointing CANONICAL_ORIGIN at
    // the dev origin, which the GitHub OAuth App's callback URL needs anyway.
    authorizeEndpoint: `${CANONICAL_ORIGIN}/oauth/authorize`,
    tokenEndpoint: `${CANONICAL_ORIGIN}/oauth/token`,
    clientRegistrationEndpoint: `${CANONICAL_ORIGIN}/oauth/register`,
    scopesSupported: [PROPOSE_SCOPE],
    // Client ID Metadata Documents: an HTTPS URL as the client id, pointing at
    // the client's own metadata. The 2026-07-28 revision prefers this and
    // deprecates Dynamic Client Registration, which stays enabled below for
    // clients that predate it. Needs the global_fetch_strictly_public
    // compatibility flag as well (see wrangler.jsonc), because the
    // authorization server fetches a URL an unknown client supplied.
    clientIdMetadataDocumentEnabled: true,
    // The resource is the MCP endpoint, not the origin, so the path-suffixed
    // metadata document at /.well-known/oauth-protected-resource/mcp describes
    // what a client actually points a token at.
    resourceMetadata: {
      resource: RESOURCE_URI,
      scopes_supported: [PROPOSE_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "aboard MCP endpoint",
    },
    // PKCE `plain` is refused: the spec requires S256 wherever a client can
    // manage it, and every MCP client can.
    allowPlainPKCE: false,
    allowImplicitFlow: false,
  });
}
