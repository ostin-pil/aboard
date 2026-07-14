import { ImageResponse } from "next/og";
import {
  getClaim,
  getClaimsWithDossiers,
  getDossierForClaim,
} from "@/lib/graph";

export function generateStaticParams() {
  return getClaimsWithDossiers().map((c) => ({ claimId: c.id }));
}

export const alt =
  "aboard — dossier · steel-manned · non-convergent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generate the images at build time (required by output: "export").
export const dynamic = "force-static";

export default async function Image({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const { claimId } = await params;
  const claim = getClaim(claimId);
  const dossier = getDossierForClaim(claimId);

  if (!claim || !dossier) {
    return notFoundImage();
  }

  const proThesis = truncate(dossier.pro.thesis, 130);
  const conThesis = truncate(dossier.con.thesis, 130);

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
          padding: "56px 64px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 16,
            letterSpacing: "0.02em",
          }}
        >
          <div style={{ display: "flex" }}>
            <span>aboard</span>
            <span style={{ color: "#78716c", padding: "0 6px" }}>/</span>
            <span style={{ color: "#57534e" }}>v0</span>
          </div>
          <div
            style={{
              color: "#57534e",
              fontSize: 14,
              letterSpacing: "0.16em",
            }}
          >
            DOSSIER · STEEL-MANNED · NON-CONVERGENT
          </div>
        </div>

        <div
          style={{
            fontSize: 36,
            fontWeight: 500,
            lineHeight: 1.18,
            letterSpacing: "-0.02em",
            marginTop: 32,
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
            gap: 16,
            marginTop: 28,
            flex: 1,
          }}
        >
          {column("PRO", proThesis, "#047857", "#ecfdf5")}
          {column("CON", conThesis, "#b91c1c", "#fef2f2")}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 16,
            fontSize: 14,
            color: "#78716c",
            letterSpacing: "0.04em",
          }}
        >
          <span>
            {dossier.cruxes.length} crux{dossier.cruxes.length === 1 ? "" : "es"} ranked
          </span>
          <span>aboard.dev/dossiers/{claim.id}</span>
        </div>
      </div>
    ),
    { ...size }
  );
}

function column(label: string, thesis: string, fg: string, bg: string) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        flex: 1,
        background: bg,
        border: `2px solid ${fg}`,
        borderRadius: 6,
        padding: "20px 22px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: fg,
          fontSize: 14,
          letterSpacing: "0.16em",
        }}
      >
        <div
          style={{ width: 8, height: 8, borderRadius: 999, background: fg }}
        />
        <span>{label}</span>
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 500,
          lineHeight: 1.32,
          letterSpacing: "-0.005em",
          color: "#0c0a09",
          display: "flex",
        }}
      >
        {thesis}
      </div>
    </div>
  );
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
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
          dossier not found
        </div>
      </div>
    ),
    { ...size }
  );
}
