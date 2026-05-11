import { ImageResponse } from "next/og";
import {
  getClaim,
  getDossierForClaim,
  getForecastsForClaim,
} from "@/lib/graph";

export const alt =
  // PLACEHOLDER: revise after audience decision in research/vision.md
  "aboard — claim detail";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const KIND_TOKENS = {
  symptom: { label: "SYMPTOM", fg: "#b91c1c", bg: "#fef2f2", bd: "#fecaca" },
  mechanism: { label: "MECHANISM", fg: "#b45309", bg: "#fffbeb", bd: "#fde68a" },
  leverage_point: { label: "LEVERAGE", fg: "#047857", bg: "#ecfdf5", bd: "#a7f3d0" },
} as const;

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

  const tokens = KIND_TOKENS[claim.kind];
  const forecasts = getForecastsForClaim(id);
  const dossier = getDossierForClaim(id);

  const facts: string[] = [];
  facts.push(`confidence ${claim.confidence.toFixed(2)}`);
  facts.push(
    `${claim.sources.length} source${claim.sources.length === 1 ? "" : "s"}`
  );
  if (forecasts.length > 0) {
    facts.push(
      `${forecasts.length} forecast${forecasts.length === 1 ? "" : "s"}`
    );
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
          background: "#fafaf9",
          color: "#0c0a09",
          padding: "64px 72px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: tokens.bg,
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
            color: "#0c0a09",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex" }}>
            <span>aboard</span>
            <span style={{ color: "#78716c", padding: "0 6px" }}>/</span>
            <span style={{ color: "#57534e" }}>v0</span>
          </div>
          <div style={{ color: "#57534e", fontSize: 14, letterSpacing: "0.06em" }}>
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
              color: tokens.fg,
            }}
          >
            {`${tokens.label} · ${claim.id}`}
          </div>

          <div
            style={{
              fontSize: clampSize(claim.title),
              fontWeight: 500,
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
              color: "#0c0a09",
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
              color: "#57534e",
              letterSpacing: "0.04em",
            }}
          >
            {facts.map((f, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                {i > 0 && <span style={{ color: "#a8a29e" }}>·</span>}
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            color: "#78716c",
            fontSize: 16,
            letterSpacing: "0.04em",
            zIndex: 1,
          }}
        >
          {`aboard.dev/claims/${claim.id}`}
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
          background: "#fafaf9",
          color: "#0c0a09",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 22, letterSpacing: "0.04em" }}>
          <span>aboard</span>
          <span style={{ color: "#78716c", padding: "0 6px" }}>/</span>
          <span style={{ color: "#57534e" }}>v0</span>
        </div>
        <div
          style={{
            fontSize: 48,
            color: "#57534e",
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
