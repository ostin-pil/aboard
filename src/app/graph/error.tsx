"use client"; // Error boundaries must be Client Components.

import { clearPersisted } from "@/components/graph/persist";

// Route-level safety net for /graph. The persisted-sandbox validation
// (persist.ts) is meant to keep a corrupt localStorage payload from ever
// throwing in render, but if something slips past it, this boundary catches the
// throw instead of letting the whole route white-screen. The escape hatch is
// the documented one (knowledge/issues.md): clear the sandbox and rebuild from
// the published data. `unstable_retry` is this Next version's segment-retry
// prop (not `reset`); see node_modules/next/dist/docs/.../error.md.
export default function GraphError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const clearAndRetry = () => {
    clearPersisted();
    unstable_retry();
  };

  return (
    <main className="canvas-host graph-error">
      <div className="graph-error-box">
        <h2>The graph hit an error</h2>
        <p>
          This usually means your local editor sandbox is out of date or
          corrupt. Clearing it rebuilds the graph from the published data and
          discards any local edits.
        </p>
        <div className="graph-error-actions">
          <button className="btn-mono" onClick={() => unstable_retry()}>
            try again
          </button>
          <button className="btn-mono primary" onClick={clearAndRetry}>
            clear sandbox and rebuild
          </button>
        </div>
        {error.digest ? (
          <p className="graph-error-digest">ref {error.digest}</p>
        ) : null}
      </div>
    </main>
  );
}
