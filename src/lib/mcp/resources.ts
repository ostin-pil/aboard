/**
 * The resource catalogue: the published JSON-LD, addressed as MCP resources.
 *
 * ## Why resources as well as tools
 *
 * `get_graph` and `get_claim` are tools that take an id and hand back a
 * document. That is what MCP resources are for: resources are
 * application-driven context a host can list, pick and read, where tools are
 * model-driven actions. The two read tools stay — a model that wants the graph
 * mid-reasoning should call one — but the same documents are now addressable
 * the way a resource picker expects, which is what lets a host surface the
 * claim graph as context without the model having to ask for it.
 *
 * ## Why `https://` URIs
 *
 * The spec reserves `https://` for resources the client could fetch itself,
 * and prefers a custom scheme otherwise. Here the client genuinely could: every
 * document these URIs name is public, CORS-open and served by the same origin
 * at the same path, so the resource URI is also the URL the document lives at.
 * Inventing `aboard://` would assert an indirection that does not exist.
 *
 * These are the API URLs, not the claim `@id`s — a claim's `@id` is its page
 * (`/claims/M4`), while its JSON-LD is served at `/api/claims/M4`. The resource
 * URI names the document you get back, which is the one a client can re-fetch.
 *
 * The advertised URIs are canonical (`CANONICAL_ORIGIN`), matching
 * `SERVER_INFO.websiteUrl` one file over and for the same reason: this module
 * is pure, has no request to derive an origin from, and a deployed Worker only
 * ever answers on the canonical origin. Reads resolve the *path* against the
 * live request, so a preview deploy still reads its own assets.
 *
 * Pure by construction, like `protocol.ts`: resolving a URI to an asset path is
 * a string operation, and the Worker does the fetching.
 */
import { CANONICAL_ORIGIN } from "@/lib/site";

/** Everything here is JSON-LD; the API sets the same type. */
export const RESOURCE_MIME_TYPE = "application/ld+json";

const GRAPH_PATH = "/api/graph";
const CLAIM_PATH_PREFIX = "/api/claims/";

export const GRAPH_RESOURCE_URI = `${CANONICAL_ORIGIN}${GRAPH_PATH}`;
export const CLAIM_RESOURCE_TEMPLATE = `${CANONICAL_ORIGIN}${CLAIM_PATH_PREFIX}{id}`;

export type ResourceDescriptor = {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
};

export type ResourceTemplateDescriptor = {
  uriTemplate: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
};

/**
 * The concrete resources, in a stable order.
 *
 * Only the graph is listed. Enumerating every claim here would make
 * `resources/list` an IO operation — it would have to read the graph to learn
 * the ids — and this layer is pure so that the wire behaviour stays testable
 * without a network. Per-claim reads are advertised as a template instead,
 * which is exactly what templates are for.
 */
const RESOURCES: readonly ResourceDescriptor[] = [
  {
    uri: GRAPH_RESOURCE_URI,
    name: "claim-graph",
    title: "aboard claim graph",
    description:
      "The full claim graph as JSON-LD: every claim, causal edge, forecast and dossier " +
      "across all domains, with sources and agent attribution. The same document " +
      "get_graph returns.",
    mimeType: RESOURCE_MIME_TYPE,
  },
];

/**
 * A template rather than a listing, so a client can address any claim without
 * this module knowing which ids exist. `list_claims` is how a caller discovers
 * the ids to substitute, and the description says so — a template with no
 * companion enumeration is otherwise a dead end.
 */
const RESOURCE_TEMPLATES: readonly ResourceTemplateDescriptor[] = [
  {
    uriTemplate: CLAIM_RESOURCE_TEMPLATE,
    name: "claim",
    title: "aboard claim",
    description:
      "One claim as JSON-LD, by id (e.g. 'M4', 'IS1'): statement, sources, observations, " +
      "attribution, incoming and outgoing edges, attached forecasts, and dossier if " +
      "present. Call the list_claims tool to discover the ids.",
    mimeType: RESOURCE_MIME_TYPE,
  },
];

export function resourceListing(): ResourceDescriptor[] {
  return RESOURCES.map((r) => ({ ...r }));
}

export function resourceTemplateListing(): ResourceTemplateDescriptor[] {
  return RESOURCE_TEMPLATES.map((t) => ({ ...t }));
}

/**
 * The asset path a resource URI names, or `null` if the URI is not one of ours.
 *
 * Strict about the origin: only the canonical one resolves, because that is the
 * only origin these URIs are ever advertised under. Being lenient would mean
 * `https://anywhere.example/api/graph` quietly reading our own graph, which is
 * harmless but says something untrue about what was read.
 */
export function resolveResourceUri(uri: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return null;
  }
  if (parsed.origin !== CANONICAL_ORIGIN) return null;
  // A query or fragment would name something other than the document itself.
  if (parsed.search !== "" || parsed.hash !== "") return null;

  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (pathname === GRAPH_PATH) return GRAPH_PATH;

  if (pathname.startsWith(CLAIM_PATH_PREFIX)) {
    const raw = pathname.slice(CLAIM_PATH_PREFIX.length);
    // One segment only: `/api/claims/M4/extra` is not a claim.
    if (raw === "" || raw.includes("/")) return null;
    let id: string;
    try {
      id = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (id === "") return null;
    return `${CLAIM_PATH_PREFIX}${encodeURIComponent(id)}`;
  }

  return null;
}
