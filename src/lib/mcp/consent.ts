/**
 * The decisions behind the consent step, kept out of the IO shell.
 *
 * Three things live here: who may be issued a credential, how the in-flight
 * authorization survives the round trip to GitHub and back without a session
 * store, and what the human is shown before they approve.
 *
 * The Worker does the GitHub calls and the provider calls. Everything in this
 * file is a pure function of its arguments plus WebCrypto, which is available
 * in both the Workers runtime and Node, so it is all unit-testable.
 */

/** The single scope an aboard credential can carry. */
export const PROPOSE_SCOPE = "aboard:propose";

/**
 * Who may obtain a write credential.
 *
 * Empty or unset means open: any GitHub account that authenticates may
 * consent. A non-empty list means only those logins may. The project decided
 * on "allowlist defaulting to open" in session 31, on the reasoning that human
 * review of every pull request is already the admission gate, and that this
 * turns a future tightening into a config change rather than a rebuild.
 *
 * Comparison is case-insensitive because GitHub logins are.
 */
export function loginAllowed(login: string, allowlist: string | undefined): boolean {
  const allowed = (allowlist ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(login.trim().toLowerCase());
}

/**
 * What has to survive the trip out to GitHub and back.
 *
 * There is no session store, so this rides in the `state` parameter and then
 * in the consent form, signed. Signing rather than storing keeps the server
 * stateless across the flow and makes tampering detectable: the client id and
 * redirect URI a user is shown at consent are the same ones the token is
 * issued against, because a changed byte fails the signature.
 */
export type ConsentState = {
  /** Opaque blob the provider handed us for `completeAuthorization`. */
  authRequest: Record<string, unknown>;
  /** Set once GitHub has identified the human. Absent on the outbound leg. */
  login?: string;
  /** GitHub's numeric user id, which is stable across a rename. */
  userId?: string;
  /** The registered client's display name, resolved once at consent so the
   *  name shown to the human is the name stamped onto their pull requests. */
  clientName?: string;
  /** Unix seconds. */
  issuedAt: number;
};

/** How long a signed state stays valid. Long enough for a human to read a
 *  consent screen, short enough that a leaked URL is not a standing grant. */
export const STATE_TTL_SECONDS = 600;

/**
 * The subject a grant is issued to, derived from GitHub's numeric user id.
 *
 * **The separator may not be a colon, and this is not cosmetic.** The OAuth
 * provider builds every authorization code and access token as
 * `${userId}:${grantId}:${random}` and parses them back with `split(":")`,
 * requiring exactly three parts. A subject containing a colon produces four,
 * so every code and every token the server issues becomes unparseable and the
 * whole flow fails at the token endpoint with `invalid_grant`.
 *
 * Found by an end-to-end run in session 31, after unit tests and every
 * pre-redirect production check had passed. Nothing before the code exchange
 * can detect it.
 *
 * GitHub's numeric id rather than the login: it survives a rename, and it is
 * what the rate limiter and every grant lookup key on.
 */
export function oauthSubject(githubUserId: string): string {
  return `github-${githubUserId}`.replace(/[^a-zA-Z0-9._-]/g, "-");
}

/**
 * The rate-limit bucket for a client registration attempt.
 *
 * Dynamic Client Registration is unauthenticated by design, which is the whole
 * point of it: a client that has never met this server can still obtain a
 * `client_id`. That also means `/oauth/register` is an open write into the
 * authorization server's storage, and it is the only endpoint here with that
 * property. A registered client can do nothing on its own, since a human must
 * still sign in and approve consent before any token exists, so the exposure
 * is junk accumulation rather than access. The library expires registrations
 * after 90 days by default, which bounds it; a brake is what stops a script
 * filling those 90 days in an afternoon.
 *
 * An absent client IP shares one bucket rather than getting a fresh one.
 * Deriving a distinct key from a missing value would hand every anonymous
 * caller its own budget, which is the opposite of a limit.
 */
export function registrationLimitKey(clientIp: string | null | undefined): string {
  const ip = (clientIp ?? "").trim();
  return `register:${ip || "unknown"}`;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Returns an ArrayBuffer rather than a view: WebCrypto's `BufferSource` is
 *  narrower than `Uint8Array<ArrayBufferLike>` under this TS lib, and the
 *  buffer form sidesteps the mismatch without a cast. */
function fromBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Sign a state blob into a URL-safe string. */
export async function sealState(state: ConsentState, secret: string): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(state)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verify and decode a sealed state, or null if it is tampered with, malformed,
 * or expired.
 *
 * One return value for every failure, deliberately: a caller that could tell
 * "bad signature" from "expired" would leak which of the two an attacker had
 * achieved.
 */
export async function openState(
  sealed: string,
  secret: string,
  now: number,
): Promise<ConsentState | null> {
  const [payload, signature] = sealed.split(".");
  if (!payload || !signature) return null;

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(signature),
      new TextEncoder().encode(payload),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  let state: ConsentState;
  try {
    state = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as ConsentState;
  } catch {
    return null;
  }

  if (typeof state.issuedAt !== "number") return null;
  if (now - state.issuedAt > STATE_TTL_SECONDS) return null;
  if (now + 60 < state.issuedAt) return null;

  return state;
}

// --- what the human sees ---------------------------------------------------

export type ConsentView = {
  clientName: string;
  redirectUri: string;
  login: string;
  sealedState: string;
};

/** Escape for interpolation into HTML text or a quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The hostname a code would be delivered to, which is the thing worth
 *  reading on this page. Falls back to the raw value if it will not parse,
 *  because showing something unparseable is better than showing nothing. */
export function redirectHost(redirectUri: string): string {
  try {
    return new URL(redirectUri).host;
  } catch {
    return redirectUri;
  }
}

/** Whether a redirect URI points at the local machine. */
export function isLoopback(redirectUri: string): boolean {
  try {
    const { hostname } = new URL(redirectUri);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * The consent page.
 *
 * Two requirements here are spec text rather than taste. The redirect URI's
 * hostname MUST be displayed, because it is where an authorization code will
 * be delivered and it is the only part of this page an attacker cannot choose
 * freely. And a loopback redirect SHOULD carry an extra warning, because any
 * local process can claim any client's identity by binding a port, which no
 * client metadata document can prevent.
 */
export function consentPage(view: ConsentView): string {
  const host = escapeHtml(redirectHost(view.redirectUri));
  const loopbackWarning = isLoopback(view.redirectUri)
    ? `<p class="warn">This will send the authorization code to a program running on your own
       computer. Any local program can ask for this. Approve it only if you started
       <strong>${escapeHtml(view.clientName)}</strong> yourself, just now.</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Authorize ${escapeHtml(view.clientName)} — aboard</title>
<style>
  :root { color-scheme: light dark; --fg: #111; --bg: #fff; --muted: #666; --line: #ddd; --warn: #8a5a00; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #e8e8e8; --bg: #111; --muted: #999; --line: #333; --warn: #e0a944; }
  }
  body { margin: 0; padding: 3rem 1.5rem; background: var(--bg); color: var(--fg);
         font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif;
         display: flex; justify-content: center; }
  main { max-width: 34rem; width: 100%; }
  h1 { font-size: 1.35rem; margin: 0 0 1.5rem; font-weight: 600; }
  dl { border: 1px solid var(--line); border-radius: 8px; padding: 1rem 1.25rem; margin: 0 0 1.5rem; }
  dt { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }
  dd { margin: 0.15rem 0 1rem; font-family: ui-monospace, SFMono-Regular, monospace; word-break: break-all; }
  dd:last-of-type { margin-bottom: 0; }
  .warn { border-left: 3px solid var(--warn); padding-left: 1rem; color: var(--warn); }
  .grants { color: var(--muted); font-size: 0.95rem; }
  .actions { display: flex; gap: 0.75rem; margin-top: 2rem; }
  button { font: inherit; padding: 0.6rem 1.25rem; border-radius: 6px; cursor: pointer; border: 1px solid var(--line); }
  button[value="approve"] { background: var(--fg); color: var(--bg); border-color: var(--fg); }
  button[value="deny"] { background: transparent; color: var(--fg); }
</style>
</head>
<body>
<main>
  <h1>Authorize <strong>${escapeHtml(view.clientName)}</strong> to propose to aboard</h1>

  <dl>
    <dt>Application</dt>
    <dd>${escapeHtml(view.clientName)}</dd>
    <dt>Will send the authorization code to</dt>
    <dd>${host}</dd>
    <dt>Signed in as</dt>
    <dd>${escapeHtml(view.login)}</dd>
  </dl>

  ${loopbackWarning}

  <p class="grants">This grants one permission, <code>${PROPOSE_SCOPE}</code>: opening pull
  requests against the aboard repository on your behalf. Every proposal is reviewed by a
  human and CI must pass before anything merges. Nothing is ever merged automatically, and
  reading aboard needs no authorization at all.</p>

  <form method="post" action="/oauth/consent">
    <input type="hidden" name="state" value="${escapeHtml(view.sealedState)}">
    <div class="actions">
      <button type="submit" name="decision" value="approve">Authorize</button>
      <button type="submit" name="decision" value="deny">Cancel</button>
    </div>
  </form>
</main>
</body>
</html>`;
}

/** A refusal page, for a login the allowlist does not carry. */
export function refusedPage(login: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Not authorized — aboard</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 3rem 1.5rem; font: 16px/1.6 ui-sans-serif, system-ui, sans-serif;
         display: flex; justify-content: center; }
  main { max-width: 34rem; }
</style>
</head>
<body>
<main>
  <h1>Not authorized</h1>
  <p>The GitHub account <strong>${escapeHtml(login)}</strong> is not on this server's list of
  accounts that may propose changes.</p>
  <p>Read access needs no credential and is unaffected: every read tool on the MCP endpoint,
  and the whole published graph, stay open.</p>
</main>
</body>
</html>`;
}
