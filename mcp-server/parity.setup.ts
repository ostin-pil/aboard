/**
 * globalSetup for the parity project: provision this package's own
 * node_modules before the test imports its modules.
 *
 * Without this, a fresh clone or worktree resolves the stdio server's `zod`
 * import up the tree to the root install (zod 4), and the parity test would
 * silently exercise a different validator than the one the package ships with
 * — the same fail-open the gate's `typecheck:mcp` command closes with its
 * `test -d node_modules || npm ci` guard, and the same trap
 * `knowledge/issues.md` records for worktrees. The test itself asserts the
 * resolution as well, so a failure here is loud twice.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export default function provision(): void {
  const dir = dirname(fileURLToPath(import.meta.url));
  if (!existsSync(join(dir, "node_modules"))) {
    execSync("npm ci --no-audit --no-fund", { cwd: dir, stdio: "inherit" });
  }
}
