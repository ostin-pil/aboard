import { siteBaseUrl } from "@/lib/site";

// Static-export to out/.well-known/api-catalog at build time (output: "export").
export const dynamic = "force-static";

/**
 * `/.well-known/api-catalog` — an API catalog (RFC 9727) serialized as an
 * RFC 9264 linkset (`application/linkset+json`). It is the entrypoint an agent
 * hits after landing on the domain: it names aboard's machine surface — the
 * JSON-LD graph endpoint, its authoritative JSON Schema (`service-desc`), the
 * human-and-agent guide and agent index (`service-doc`), and the gated write
 * path. Every anchor is built from `siteBaseUrl()` so the catalog can never
 * advertise a URL the site does not serve.
 */
export function GET() {
  const base = siteBaseUrl();

  const catalog = {
    linkset: [
      {
        anchor: `${base}/api/graph`,
        "service-desc": [
          {
            href: `${base}/schema/v0.json`,
            type: "application/schema+json",
            title: "aboard JSON-LD schema (authoritative)",
          },
        ],
        "service-doc": [
          {
            href: `${base}/about`,
            type: "text/html",
            title: "aboard — human and agent guide",
          },
          {
            href: `${base}/llms.txt`,
            type: "text/plain",
            title: "Agent index of the whole claim graph",
          },
        ],
      },
      {
        anchor: `${base}/api/proposals`,
        "service-doc": [
          {
            href: `${base}/about`,
            type: "text/html",
            title: "Gated agent write path — propose claims, edges, forecasts, dossiers",
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(catalog, null, 2) + "\n", {
    headers: {
      "Content-Type": "application/linkset+json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
