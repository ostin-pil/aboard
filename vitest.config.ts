import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirror the `@/*` path alias from tsconfig.json, so tests import modules
// exactly the way the app does.
const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
};

/**
 * Three projects, because the three test surfaces have different reach:
 *
 * - `unit`: the pure modules under src/. Anything that reaches the filesystem
 *   loader would pull in `server-only` and the Next runtime; the build already
 *   covers that path end to end. `.tsx` is in the glob since session 66 for
 *   `a11y.test.tsx`, which renders components to run axe over them: passing
 *   children through `createElement`'s props object is what `react/no-children-prop`
 *   exists to refuse, and passing them variadically does not satisfy a `Props`
 *   that requires them. JSX is the shape that satisfies both. One exception, argued in
 *   `src/lib/data/loader.test.ts`: listing *order* is the one loader property
 *   the build cannot check, because it reads `data/` once on one filesystem and
 *   validates whatever order it gets. That file mocks `server-only` away and
 *   reverses `readdirSync`, and it is the only test here that touches the
 *   loader at all.
 * - `worker`: the Worker's HTTP shell (worker/*.test.ts), driven through
 *   `route()` with faked bindings. Plain node rather than
 *   `@cloudflare/vitest-pool-workers` — the probe (session 64) found the pool
 *   compatible with vitest 4, but every seam these tests exercise (assets,
 *   limiter, analytics, GitHub) is injected or fetch-stubbed either way, and
 *   node ships the same Request/Response the Worker runtime uses. Revisit if
 *   the Worker ever grows workerd-only surface such as `caches.default`.
 * - `parity`: pins the stdio server's tool surface to the remote one. Lives in
 *   mcp-server/ so its imports resolve that package's own dependencies (zod 3);
 *   its globalSetup provisions mcp-server/node_modules so a fresh clone or
 *   worktree gets a real check rather than a silently different one.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["src/**/*.test.{ts,tsx}"], environment: "node" },
      },
      {
        resolve: { alias },
        test: { name: "worker", include: ["worker/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "parity",
          include: ["mcp-server/*.test.ts"],
          environment: "node",
          globalSetup: ["./mcp-server/parity.setup.ts"],
        },
      },
    ],
  },
});
