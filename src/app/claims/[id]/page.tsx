import {
  getClaim,
  getEdgesForClaim,
  getForecastsForClaim,
  getDossierForClaim,
} from "@/lib/graph";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Claim } from "@/lib/types";

const kindLabel: Record<Claim["kind"], string> = {
  symptom: "SYMPTOM",
  mechanism: "MECHANISM",
  leverage_point: "LEVERAGE",
};

const kindClass: Record<Claim["kind"], string> = {
  symptom: "symptom",
  mechanism: "mechanism",
  leverage_point: "leverage",
};

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const claim = getClaim(id);
  if (!claim) notFound();

  const { incoming, outgoing } = getEdgesForClaim(id);
  const forecasts = getForecastsForClaim(id);
  const dossier = getDossierForClaim(id);

  return (
    <main className="page">
      <Link className="breadcrumb" href="/graph">
        ← graph
      </Link>

      <span className={`kind-label ${kindClass[claim.kind]}`}>
        {kindLabel[claim.kind]} · {claim.id}
      </span>

      <h1 className="detail-headline">{claim.title}</h1>

      <div className="meta-row">
        <span className="item">
          <span className="key">confidence</span>
          <span className="val">{claim.confidence.toFixed(2)}</span>
        </span>
        <span className="sep">·</span>
        <span className="item">
          <span className="key">domain</span>
          <span className="val">{claim.domain}</span>
        </span>
        <span className="sep">·</span>
        <span className="item">
          <a className="val" href={`/api/claims/${claim.id}`}>
            JSON-LD
          </a>
        </span>
      </div>

      <section className="block">
        <h2 className="section-label">Statement</h2>
        <p className="statement">{claim.statement}</p>
      </section>

      <section className="block">
        <h2 className="section-label">Provenance</h2>
        <div className="provenance">
          <div className="row">
            <span className="key">authored by</span>
            <span className="v">
              {claim.authoredBy.agent}
              {claim.authoredBy.promptTitle && (
                <span className="sub"> · prompt: {claim.authoredBy.promptTitle}</span>
              )}
            </span>
          </div>
          <div className="row">
            <span className="key">generated at</span>
            <span className="v">{claim.authoredBy.generatedAt}</span>
          </div>
        </div>
      </section>

      <section className="block">
        <h2 className="section-label">Sources</h2>
        <ul className="sources">
          {claim.sources.map((s, i) => (
            <li key={i}>
              <a className="src-title" href={s.url} target="_blank" rel="noopener noreferrer">
                {s.label}
              </a>
              <div className="src-url">{s.url}</div>
              {s.excerpt && <div className="src-excerpt">{s.excerpt}</div>}
            </li>
          ))}
        </ul>
      </section>

      {(incoming.length > 0 || outgoing.length > 0) && (
        <section className="block">
          <h2 className="section-label">Causal links</h2>
          <div className="links-grid">
            <div className="link-block">
              <div className="sub-label">Outgoing</div>
              {outgoing.length === 0 ? (
                <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>—</div>
              ) : (
                outgoing.map((e) => {
                  const target = getClaim(e.toId);
                  if (!target) return null;
                  return (
                    <div className="link-row" key={e.id}>
                      <span className={`rel ${e.kind}`}>
                        {e.kind} <span className="arrow">→</span>
                      </span>
                      <Link className={`target ${kindClass[target.kind]}`} href={`/claims/${target.id}`}>
                        {target.title}
                      </Link>
                      <span className="strength">
                        strength <span className="v">{e.strength.toFixed(2)}</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <div className="link-block">
              <div className="sub-label">Incoming</div>
              {incoming.length === 0 ? (
                <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>—</div>
              ) : (
                incoming.map((e) => {
                  const source = getClaim(e.fromId);
                  if (!source) return null;
                  return (
                    <div className="link-row" key={e.id}>
                      <span className={`rel ${e.kind}`}>
                        {e.kind} <span className="arrow">←</span>
                      </span>
                      <Link className={`target ${kindClass[source.kind]}`} href={`/claims/${source.id}`}>
                        {source.title}
                      </Link>
                      <span className="strength">
                        strength <span className="v">{e.strength.toFixed(2)}</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      )}

      {forecasts.length > 0 && (
        <section className="block">
          <h2 className="section-label">Attached forecasts</h2>
          {forecasts.map((f) => (
            <div className="forecast" key={f.id}>
              <div className="forecast-head">
                <h3 className="question">{f.question}</h3>
                <div className="resolves">
                  <span className="id">{f.id}</span>
                  <span className="sep">·</span>
                  <span>resolves {f.resolutionDate}</span>
                </div>
                <p className="criteria">{f.resolutionCriteria}</p>
              </div>
              {f.predictions.map((p, i) => (
                <div className="prediction" key={i}>
                  <div>
                    <div className="p-num">
                      <span className="eq">P =</span>
                      {p.probability.toFixed(2)}
                    </div>
                    <div className="agent">
                      filed by <span className="name">{p.agent.agent}</span>
                    </div>
                  </div>
                  <div>
                    <div className="reasoning-label">Reasoning</div>
                    <p className="reasoning">{p.reasoning}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {dossier && (
        <section className="block">
          <h2 className="section-label">Dossier</h2>
          <div className="dossier-block">
            <Link className="dossier-cta" href={`/dossiers/${claim.id}`}>
              <span>View dual-dossier · pro/con + cruxes</span>
              <span className="arrow">→</span>
            </Link>
            <p className="dossier-note">
              This claim is contested. The dossier contains a steel-manned pro and con thesis
              with ranked cruxes; views did not converge.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
