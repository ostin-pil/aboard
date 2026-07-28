import { describe, expect, it } from "vitest";
import {
  PROPOSE_SCOPE,
  STATE_TTL_SECONDS,
  consentPage,
  escapeHtml,
  isLoopback,
  loginAllowed,
  oauthSubject,
  openState,
  redirectHost,
  refusedPage,
  sealState,
  type ConsentState,
} from "@/lib/mcp/consent";

const SECRET = "test-secret-not-a-real-one";
const NOW = 1_800_000_000;

function state(overrides: Partial<ConsentState> = {}): ConsentState {
  return {
    authRequest: { clientId: "abc", redirectUri: "https://client.example/cb" },
    login: "ostin-pil",
    userId: "12345",
    issuedAt: NOW,
    ...overrides,
  };
}

describe("the allowlist", () => {
  it("is open when unset or empty", () => {
    expect(loginAllowed("anyone", undefined)).toBe(true);
    expect(loginAllowed("anyone", "")).toBe(true);
    expect(loginAllowed("anyone", "   ")).toBe(true);
    expect(loginAllowed("anyone", " , , ")).toBe(true);
  });

  it("admits only listed logins once set", () => {
    expect(loginAllowed("ostin-pil", "ostin-pil,someone")).toBe(true);
    expect(loginAllowed("someone", "ostin-pil,someone")).toBe(true);
    expect(loginAllowed("stranger", "ostin-pil,someone")).toBe(false);
  });

  it("compares case-insensitively and tolerates padding", () => {
    expect(loginAllowed("Ostin-Pil", "ostin-pil")).toBe(true);
    expect(loginAllowed("ostin-pil", " OSTIN-PIL , other ")).toBe(true);
  });
});

describe("the grant subject", () => {
  // Regression, session 31. The provider packs the subject into every
  // authorization code and access token as `${userId}:${grantId}:${random}`
  // and parses them back with split(":"), requiring exactly three parts. A
  // subject carrying a colon made every token this server issued unparseable,
  // and the flow died at the token endpoint with invalid_grant. Unit tests and
  // every pre-redirect production check passed; only an end-to-end run saw it.
  it("never contains a colon, whatever GitHub returns", () => {
    expect(oauthSubject("165952329")).toBe("github-165952329");
    expect(oauthSubject("165952329")).not.toContain(":");
    expect(oauthSubject("weird:id")).not.toContain(":");
    expect(oauthSubject("a:b:c:d")).not.toContain(":");
  });

  it("splits into exactly three parts when packed into a token", () => {
    const token = `${oauthSubject("165952329")}:grantid:randomsecret`;
    expect(token.split(":")).toHaveLength(3);
  });

  it("stays filesystem- and URL-safe", () => {
    expect(oauthSubject("../../etc/passwd")).toMatch(/^[a-zA-Z0-9._-]+$/);
    expect(oauthSubject("a b c")).toMatch(/^[a-zA-Z0-9._-]+$/);
  });
});

describe("the sealed state", () => {
  it("round-trips through a signature", async () => {
    const sealed = await sealState(state(), SECRET);
    const opened = await openState(sealed, SECRET, NOW);
    expect(opened).toEqual(state());
  });

  it("is URL-safe, so it survives a query string intact", async () => {
    const sealed = await sealState(state(), SECRET);
    expect(sealed).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(sealed)).toBe(sealed);
  });

  it("rejects a tampered payload", async () => {
    const sealed = await sealState(state(), SECRET);
    const [payload, signature] = sealed.split(".");
    // Flip the client the user would be consenting to.
    const forged = await sealState(
      state({ authRequest: { clientId: "evil", redirectUri: "https://evil.example/cb" } }),
      "some-other-secret",
    );
    const tampered = `${forged.split(".")[0]}.${signature}`;
    expect(await openState(tampered, SECRET, NOW)).toBeNull();
    // And the original still verifies, so the test is not passing vacuously.
    expect(await openState(`${payload}.${signature}`, SECRET, NOW)).not.toBeNull();
  });

  it("rejects a signature made with a different secret", async () => {
    const sealed = await sealState(state(), "the-wrong-secret");
    expect(await openState(sealed, SECRET, NOW)).toBeNull();
  });

  it("rejects a malformed blob rather than throwing", async () => {
    expect(await openState("", SECRET, NOW)).toBeNull();
    expect(await openState("nodot", SECRET, NOW)).toBeNull();
    expect(await openState("a.b", SECRET, NOW)).toBeNull();
    expect(await openState("...", SECRET, NOW)).toBeNull();
  });

  it("expires, so a leaked consent URL is not a standing grant", async () => {
    const sealed = await sealState(state(), SECRET);
    expect(await openState(sealed, SECRET, NOW + STATE_TTL_SECONDS - 1)).not.toBeNull();
    expect(await openState(sealed, SECRET, NOW + STATE_TTL_SECONDS + 1)).toBeNull();
  });

  it("rejects a state issued in the future beyond clock skew", async () => {
    const sealed = await sealState(state({ issuedAt: NOW + 3600 }), SECRET);
    expect(await openState(sealed, SECRET, NOW)).toBeNull();
  });
});

describe("reading a redirect URI", () => {
  it("extracts the host that a code would be delivered to", () => {
    expect(redirectHost("https://client.example/cb")).toBe("client.example");
    expect(redirectHost("http://127.0.0.1:3000/callback")).toBe("127.0.0.1:3000");
  });

  it("falls back to the raw value rather than showing nothing", () => {
    expect(redirectHost("not a uri")).toBe("not a uri");
  });

  it("recognizes loopback redirects", () => {
    expect(isLoopback("http://localhost:8976/cb")).toBe(true);
    expect(isLoopback("http://127.0.0.1:3000/cb")).toBe(true);
    expect(isLoopback("https://client.example/cb")).toBe(false);
    expect(isLoopback("garbage")).toBe(false);
  });
});

describe("escaping", () => {
  it("neutralizes the characters that would break out of HTML", () => {
    expect(escapeHtml(`<script>"x"&'y'`)).toBe(
      "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;",
    );
  });
});

describe("the consent page", () => {
  const view = {
    clientName: "Example Client",
    redirectUri: "https://client.example/cb",
    login: "ostin-pil",
    sealedState: "abc.def",
  };

  it("shows the redirect host, which the spec requires", () => {
    expect(consentPage(view)).toContain("client.example");
  });

  it("names the client, the login and the single scope", () => {
    const html = consentPage(view);
    expect(html).toContain("Example Client");
    expect(html).toContain("ostin-pil");
    expect(html).toContain(PROPOSE_SCOPE);
  });

  it("carries the sealed state into the form", () => {
    expect(consentPage(view)).toContain('name="state" value="abc.def"');
  });

  it("offers both an approve and a deny, so consent can be refused", () => {
    const html = consentPage(view);
    expect(html).toContain('value="approve"');
    expect(html).toContain('value="deny"');
  });

  it("warns extra on a loopback redirect", () => {
    const local = consentPage({ ...view, redirectUri: "http://localhost:8976/cb" });
    expect(local).toContain("your own");
    expect(consentPage(view)).not.toContain("your own");
  });

  it("escapes a hostile client name rather than rendering it", () => {
    const html = consentPage({ ...view, clientName: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("asks not to be indexed", () => {
    expect(consentPage(view)).toContain('name="robots" content="noindex"');
  });
});

describe("the refusal page", () => {
  it("names the login and says reading is unaffected", () => {
    const html = refusedPage("stranger");
    expect(html).toContain("stranger");
    expect(html.toLowerCase()).toContain("read");
  });

  it("escapes the login", () => {
    expect(refusedPage("<b>x</b>")).not.toContain("<b>x</b>");
  });
});
