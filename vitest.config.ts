import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirror the `@/*` path alias from tsconfig.json, so tests import modules
    // exactly the way the app does.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Only unit tests over pure modules for now. Anything that reaches the
    // filesystem loader would pull in `server-only` and the Next runtime; the
    // build already covers that path end to end.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
