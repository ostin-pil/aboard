import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next registers the jsx-a11y plugin but turns on only six of
  // its 39 rules, all as warnings. Take the plugin's own recommended set
  // instead — rules only, because re-registering a plugin the shared config
  // already declared is a hard config error.
  { rules: jsxA11y.flatConfigs.recommended.rules },
  {
    rules: {
      // The rule's default allow-list is `tabpanel` only. A scrollable box that
      // keyboard users cannot reach is WCAG 2.1.1, so the JSON-LD export's
      // `<pre>` has to be focusable; naming it a `region` is what makes that tab
      // stop announce itself instead of being a bare focusable div.
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { tags: [], roles: ["tabpanel", "region"], allowExpressionValues: true },
      ],
    },
  },
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
