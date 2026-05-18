// SCAFFOLD — layout/UX intentionally minimal; final design deferred (see PR notes)
//
// Server Component (no interactivity). Renders the derived interpretation
// numbers for one forecast: aggregate, spread, and the leave-one-out deltas.
// All math comes from src/lib/forecast.ts — this component derives nothing
// itself. Styling is the namespaced `ic-*` block at the end of globals.css
// and is deliberately bare; the real interpretation UX is designed separately.

import { aggregate, leaveOneOut } from "@/lib/forecast";
import type { Forecast } from "@/lib/types";

export function InterpretationCard({ forecast }: { forecast: Forecast }) {
  const stats = aggregate(forecast.predictions);
  if (stats.count < 2) return null; // single prediction: nothing to interpret

  const loo = leaveOneOut(forecast.predictions);

  return (
    <div className="ic-card">
      <div className="ic-head">
        interpretation · {forecast.id} · SCAFFOLD
      </div>

      <div className="ic-stats">
        <span className="ic-stat">
          <span className="ic-k">median</span>
          <span className="ic-v">{stats.median.toFixed(2)}</span>
        </span>
        <span className="ic-stat">
          <span className="ic-k">mean</span>
          <span className="ic-v">{stats.mean.toFixed(2)}</span>
        </span>
        <span className="ic-stat">
          <span className="ic-k">spread</span>
          <span className="ic-v">{stats.spread.toFixed(2)}</span>
        </span>
        <span className="ic-stat">
          <span className="ic-k">range</span>
          <span className="ic-v">
            {stats.min.toFixed(2)}–{stats.max.toFixed(2)}
          </span>
        </span>
        <span className="ic-stat">
          <span className="ic-k">n</span>
          <span className="ic-v">{stats.count}</span>
        </span>
      </div>

      <div className="ic-loo">
        <div className="ic-loo-label">
          leave-one-out (median if model dropped)
        </div>
        <ul className="ic-loo-list">
          {loo.entries.map((e) => {
            const sign = e.deltaFromBaseline > 0 ? "+" : "";
            return (
              <li key={e.droppedIndex} className="ic-loo-row">
                <span className="ic-loo-agent">{e.droppedAgent}</span>
                <span className="ic-loo-drop">
                  drop {e.droppedProbability.toFixed(2)}
                </span>
                <span className="ic-loo-median">
                  → {e.medianWithout.toFixed(2)}
                </span>
                <span className="ic-loo-delta">
                  ({sign}
                  {e.deltaFromBaseline.toFixed(2)})
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
