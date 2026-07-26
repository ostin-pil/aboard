import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Worker bundles from `wrangler dev`. Not ours, and linting them
    // buried the real warning count under ~170 findings about generated code.
    ".wrangler/**",
    // Session worktrees (`worktree_dir` in .claude/lifecycle-manifest.md). A
    // worktree parked here is a second checkout of this same repo, so linting
    // it reports every file twice and can fail the gate on code that is not in
    // the tree being checked.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
