import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the filesystem-backed data/ directory is bundled with the
  // serverless function output. The loader reads it at module-eval time.
  outputFileTracingIncludes: {
    "/**/*": ["./data/**/*"],
  },
};

export default nextConfig;
