import { ImageResponse } from "next/og";
import {
  getClaim,
  getClaims,
  getDossierForClaim,
  getForecastsForClaim,
} from "@/lib/graph";
import { aggregate } from "@/lib/forecast";
import { siteHost } from "@/lib/site";
import { kindPalette, surface } from "@/lib/tokens";
import type { ClaimKind } from "@/lib/types";

export function generateStaticParams() {
  return getClaims().map((c) => ({ id: c.id }));
}

export const alt =
  "aboard — claim detail";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generate the images at build time (required by output: "export").
export const dynamic = "force-static";

// The colours live in `@/lib/tokens`, checked against globals.css. What stays
// here is the one thing that is this card's own: the eyebrow wording, which is
// neither the claim kind as stored nor the plural the site card prints.
const KIND_LABEL: Record<ClaimKind, string> = {
  symptom: "SYMPTOM",
  mechanism: "MECHANISM",
  leverage_point: "LEVERAGE",
};

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const claim = getClaim(id);

  if (!claim) {
    return notFoundImage();
  }

  const palette = kindPalette[claim.kind];
  const forecasts = getForecastsForClaim(id);
  const dossier = getDossierForClaim(id);

  const facts: string[] = [];
  facts.push(`confidence ${claim.confidence.toFixed(2)}`);
  facts.push(
    `${claim.sources.length} source${claim.sources.length === 1 ? "" : "s"}`
  );
  for (const f of forecasts) {
    const stats = aggregate(f.predictions);
    if (stats.count > 1) {
      facts.push(`forecast P=${stats.median.toFixed(2)} (ensemble of ${stats.count})`);
    } else if (stats.count === 1) {
      facts.push(`forecast P=${stats.median.toFixed(2)}`);
    } else {
      facts.push("forecast attached");
    }
  }
  if (dossier) {
    facts.push("dossier");
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: surface.bg,
          color: surface.fg,
          padding: "64px 72px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: palette.bg,
            opacity: 0.5,
            zIndex: 0,
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 18,
            letterSpacing: "0.02em",
            color: surface.fg,
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex" }}>
            <span>aboard</span>
            <span style={{ color: surface.muted2, padding: "0 6px" }}>/</span>
            <span style={{ color: surface.muted }}>v0</span>
          </div>
          <div style={{ color: surface.muted, fontSize: 14, letterSpacing: "0.06em" }}>
            {`domain · ${claim.domain}`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            zIndex: 1,
            gap: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 18,
              letterSpacing: "0.12em",
              color: palette.fg,
            }}
          >
            {`${KIND_LABEL[claim.kind]} · ${claim.id}`}
          </div>

          <div
            style={{
              fontSize: clampSize(claim.title),
              fontWeight: 500,
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
              color: surface.fg,
              display: "flex",
              maxWidth: 1080,
            }}
          >
            {claim.title}
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              fontSize: 18,
              color: surface.muted,
              letterSpacing: "0.04em",
            }}
          >
            {facts.map((f, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                {i > 0 && <span style={{ color: surface.separator }}>·</span>}
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            color: surface.muted2,
            fontSize: 16,
            letterSpacing: "0.04em",
            zIndex: 1,
          }}
        >
          {`${siteHost()}/claims/${claim.id}`}
        </div>
      </div>
    ),
    { ...size }
  );
}

function clampSize(text: string) {
  const len = text.length;
  if (len < 40) return 64;
  if (len < 70) return 56;
  if (len < 100) return 48;
  return 42;
}

function notFoundImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: surface.bg,
          color: surface.fg,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 22, letterSpacing: "0.04em" }}>
          <span>aboard</span>
          <span style={{ color: surface.muted2, padding: "0 6px" }}>/</span>
          <span style={{ color: surface.muted }}>v0</span>
        </div>
        <div
          style={{
            fontSize: 48,
            color: surface.muted,
            marginTop: 16,
            letterSpacing: "-0.01em",
          }}
        >
          claim not found
        </div>
      </div>
    ),
    { ...size }
  );
}
