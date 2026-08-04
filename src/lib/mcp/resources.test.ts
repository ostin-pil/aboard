import { describe, expect, it } from "vitest";
import {
  CLAIM_RESOURCE_TEMPLATE,
  GRAPH_RESOURCE_URI,
  RESOURCE_MIME_TYPE,
  resolveResourceUri,
  resourceListing,
  resourceTemplateListing,
} from "@/lib/mcp/resources";
import { CANONICAL_ORIGIN } from "@/lib/site";

describe("the catalogue", () => {
  it("lists the graph as a concrete resource and the claim as a template", () => {
    const resources = resourceListing();
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      uri: GRAPH_RESOURCE_URI,
      name: "claim-graph",
      mimeType: RESOURCE_MIME_TYPE,
    });

    const templates = resourceTemplateListing();
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      uriTemplate: CLAIM_RESOURCE_TEMPLATE,
      name: "claim",
      mimeType: RESOURCE_MIME_TYPE,
    });
  });

  it("advertises canonical https URIs, so a resource URI is also its JSON-LD @id", () => {
    expect(GRAPH_RESOURCE_URI).toBe(`${CANONICAL_ORIGIN}/api/graph`);
    expect(CLAIM_RESOURCE_TEMPLATE).toBe(`${CANONICAL_ORIGIN}/api/claims/{id}`);
  });

  it("hands out copies, so a caller cannot edit the catalogue", () => {
    const first = resourceListing();
    first[0].title = "mutated";
    expect(resourceListing()[0].title).not.toBe("mutated");
  });
});

describe("resolveResourceUri", () => {
  it("resolves the graph and a claim to their asset paths", () => {
    expect(resolveResourceUri(GRAPH_RESOURCE_URI)).toBe("/api/graph");
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/api/claims/M4`)).toBe("/api/claims/M4");
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/api/claims/IS1`)).toBe("/api/claims/IS1");
  });

  it("tolerates a trailing slash", () => {
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/api/graph/`)).toBe("/api/graph");
  });

  it("re-encodes a decoded id rather than passing the raw segment through", () => {
    // A percent-encoded id round-trips to exactly one path segment; the point is
    // that the id is decoded, checked, then re-encoded, so a crafted segment
    // cannot smuggle a second path component into the asset fetch.
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/api/claims/a%20b`)).toBe("/api/claims/a%20b");
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/api/claims/a%2Fb`)).toBe("/api/claims/a%2Fb");
  });

  it("refuses a foreign origin, even at one of our own paths", () => {
    expect(resolveResourceUri("https://elsewhere.example/api/graph")).toBeNull();
    expect(resolveResourceUri("http://aboard.untype.me/api/graph")).toBeNull();
  });

  it("refuses a path that is not a resource", () => {
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/api/claims`)).toBeNull();
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/api/claims/`)).toBeNull();
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/api/claims/M4/extra`)).toBeNull();
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/api/forecasts/F4`)).toBeNull();
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/`)).toBeNull();
  });

  it("refuses a query or fragment, which would name something other than the document", () => {
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/api/graph?x=1`)).toBeNull();
    expect(resolveResourceUri(`${CANONICAL_ORIGIN}/api/graph#frag`)).toBeNull();
  });

  it("refuses anything that is not an absolute URL", () => {
    expect(resolveResourceUri("/api/graph")).toBeNull();
    expect(resolveResourceUri("aboard://graph")).toBeNull();
    expect(resolveResourceUri("")).toBeNull();
    expect(resolveResourceUri("not a url")).toBeNull();
  });
});
