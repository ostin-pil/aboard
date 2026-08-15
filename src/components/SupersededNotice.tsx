import Link from "next/link";

import { graph } from "@/lib/graph";
import { replacements } from "@/lib/superseded";
import type { Forecast } from "@/lib/types";

/**
 * Marks a forecast the corpus has retired, and names what replaced it.
 *
 * The resolution logic lives in `@/lib/superseded` so the Markdown twin at
 * `/claims/[id]/index.md` renders the same facts from the same function. This
 * file is the JSX around it.
 *
 * Returns null when the forecast is live, so call sites drop it in
 * unconditionally rather than repeating the guard.
 */
export function SupersededNotice({ forecast }: { forecast: Forecast }) {
  const found = replacements(forecast, graph.forecasts);
  if (found.length === 0) return null;

  return (
    <p className="superseded-notice">
      <span className="superseded-tag">Superseded</span>
      <span>
        Replaced by{" "}
        {found.map((r, i) => (
          <span key={r.id}>
            {i > 0 ? (i === found.length - 1 ? " and " : ", ") : ""}
            {r.claimId ? (
              <Link href={`/claims/${r.claimId}#${r.id}`}>{r.id}</Link>
            ) : (
              r.id
            )}
          </span>
        ))}
        . The predictions below answered the question as originally filed.
      </span>
    </p>
  );
}
