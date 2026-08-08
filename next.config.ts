import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the whole site is a pure function of data/, fixed at build
  // time, so it builds to portable static files deployable to any static host
  // with no server runtime. JSON-LD @ids are always absolute: SITE_URL sets the
  // base for a preview or local build, and an unset SITE_URL falls back to
  // CANONICAL_ORIGIN (src/lib/site.ts), never to relative IRIs — v0.json
  // requires "format": "uri" on every @id.
  output: "export",
};

export default nextConfig;
