import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the whole site is a pure function of data/, fixed at build
  // time, so it builds to portable static files deployable to any static host
  // with no server runtime. Set SITE_URL at build time to emit absolute
  // JSON-LD @ids; when unset, relative IRIs are used (valid JSON-LD).
  output: "export",
};

export default nextConfig;
