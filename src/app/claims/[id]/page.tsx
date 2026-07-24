import {
  getClaim,
  getClaims,
  getEdgesForClaim,
  getForecastsForClaim,
  getDossierForClaim,
  getAnalysesForClaim,
  graph,
} from "@/lib/graph";
import { fullClaimLD } from "@/lib/jsonld";
import { siteBaseUrl } from "@/lib/site";
import { aggregate } from "@/lib/forecast";
import { modelFamily, modelFamilyLabel } from "@/lib/model-family";
import { InterpretationCard } from "@/components/InterpretationCard";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { Claim } from "@/lib/types";

export function generateStaticParams() {
  return getClaims().map((c) => ({ id: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const claim = getClaim(id);
  if (!claim) {
    return { title: "claim not found" };
  }
  const description = `${kindLabel[claim.kind]} · ${claim.id} — confidence ${claim.confidence.toFixed(
    2
  )} · domain ${claim.domain}.`;
  const title = `${claim.id} · ${claim.title}`;
  return {
    title,
    description,
    alternates: {
      // Let an agent that landed on the HTML hop to the structured record and
      // the Markdown twin without guessing the API shape.
      types: {
        "application/ld+json": `/api/claims/${claim.id}`,
        "text/markdown": `/claims/${claim.id}/index.md`,
      },
    },
    openGraph: {
      type: "article",
      siteName: "aboard",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

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
  const analyses = getAnalysesForClaim(claim);
  const ldJson = JSON.stringify(fullClaimLD(claim, graph, siteBaseUrl()));

  return (
    <main className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson }}
      />
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

      {claim.dataPoints.length > 0 && (
        <section className="block">
          <h2 className="section-label">Data</h2>
          <ul className="datapoints">
            {claim.dataPoints.map((dp, i) => {
              const meta = [dp.period, dp.geography].filter(Boolean).join(" · ");
              return (
                <li key={i}>
                  <div className="dp-metric">{dp.metric}</div>
                  <div className="dp-value">
                    <span className="v">{dp.value}</span>
                    {dp.unit && <span className="u"> {dp.unit}</span>}
                    {meta && <span className="meta"> · {meta}</span>}
                  </div>
                  <a className="dp-src" href={dp.source.url} target="_blank" rel="noopener noreferrer">
                    {dp.source.label}
                  </a>
                  {dp.note && <div className="dp-note">{dp.note}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
          {claim.sources.map((s, i) => {
            const metaParts = [
              s.kind,
              s.year ? String(s.year) : null,
              s.authors,
            ].filter(Boolean);
            return (
              <li key={i}>
                <a className="src-title" href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
                {metaParts.length > 0 && (
                  <div className="src-meta">{metaParts.join(" · ")}</div>
                )}
                <div className="src-url">{s.url}</div>
                {s.finding && <div className="src-finding">{s.finding}</div>}
                {s.excerpt && <div className="src-excerpt">{s.excerpt}</div>}
              </li>
            );
          })}
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
                      {e.rationale && (
                        <p className="link-rationale">{e.rationale}</p>
                      )}
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
                      {e.rationale && (
                        <p className="link-rationale">{e.rationale}</p>
                      )}
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
          {forecasts.map((f) => {
            const stats = aggregate(f.predictions);
            const isEnsemble = stats.count > 1;
            return (
              <div className="forecast" key={f.id}>
                <div className="forecast-head">
                  <h3 className="question">{f.question}</h3>
                  <div className="resolves">
                    <span className="id">{f.id}</span>
                    <span className="sep">·</span>
                    <span>resolves {f.resolutionDate}</span>
                    {isEnsemble && (
                      <>
                        <span className="sep">·</span>
                        <span>ensemble of {stats.count}</span>
                      </>
                    )}
                  </div>
                  <p className="criteria">{f.resolutionCriteria}</p>
                </div>

                {isEnsemble && (
                  <div className="ensemble-head">
                    <div className="big-num">
                      <span className="eq">P =</span>
                      {stats.median.toFixed(2)}
                    </div>
                    <div className="aux">
                      <span>{stats.count} agents</span>
                      <span className="dot">·</span>
                      <span>spread {stats.spread.toFixed(2)}</span>
                      <span className="dot">·</span>
                      <span>range {stats.min.toFixed(2)}–{stats.max.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {isEnsemble && <InterpretationCard forecast={f} />}

                <details className={isEnsemble ? "ensemble-details" : "single-details"} open={!isEnsemble}>
                  <summary>
                    {isEnsemble
                      ? `Individual predictions (${stats.count})`
                      : "Prediction"}
                  </summary>
                  {f.predictions.map((p, i) => {
                    const fam = modelFamily(p.agent.agent);
                    return (
                    <div className="prediction" key={i}>
                      <div>
                        <div className="p-num">
                          <span className="eq">P =</span>
                          {p.probability.toFixed(2)}
                        </div>
                        <div className="agent">
                          <span className={`family-tag fam-${fam}`}>
                            {modelFamilyLabel(fam)}
                          </span>
                          filed by <span className="name">{p.agent.agent}</span>
                        </div>
                      </div>
                      <div>
                        <div className="reasoning-label">Reasoning</div>
                        <p className="reasoning">{p.reasoning}</p>
                        {p.baseRates.length > 0 && (
                          <div className="prediction-anchors">
                            <div className="anchor-label">Base rates</div>
                            <ul className="anchor-list">
                              {p.baseRates.map((b, j) => (
                                <li key={j}>
                                  <span className="rate">{b.rate.toFixed(2)}</span>
                                  <span className="q">{b.question}</span>
                                  <a className="src" href={b.source.url} target="_blank" rel="noopener noreferrer">
                                    {b.source.label}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {p.dataAnchors.length > 0 && (
                          <div className="prediction-anchors">
                            <div className="anchor-label">Data anchors</div>
                            <ul className="anchor-list">
                              {p.dataAnchors.map((s, j) => (
                                <li key={j}>
                                  <a className="src" href={s.url} target="_blank" rel="noopener noreferrer">
                                    {s.label}
                                  </a>
                                  {s.finding && <span className="finding">{s.finding}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </details>
              </div>
            );
          })}
        </section>
      )}

      {analyses.length > 0 && (
        <section className="block">
          <h2 className="section-label">Analyses</h2>
          <ul className="analyses">
            {analyses.map((a) => (
              <li key={a.id} className="analysis">
                <div className="ana-head">
                  <span className="ana-kind">{a.kind}</span>
                  <span className="ana-id">{a.id}</span>
                </div>
                <h3 className="ana-title">{a.title}</h3>
                <p className="ana-summary">{a.summary}</p>
                <div className="ana-finding">
                  <span className="lbl">Finding</span>
                  <span>{a.producedFinding}</span>
                </div>
                <div className="ana-src-label">Data sources ({a.dataSources.length})</div>
                <ul className="ana-src-list">
                  {a.dataSources.map((s, j) => (
                    <li key={j}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
                      {s.year && <span className="year"> · {s.year}</span>}
                      {s.finding && <span className="finding"> — {s.finding}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
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
