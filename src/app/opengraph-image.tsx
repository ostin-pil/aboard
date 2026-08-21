import { ImageResponse } from "next/og";
import { site } from "@/lib/content/loader";
import { graph } from "@/lib/graph";
import { kindPalette, surface } from "@/lib/tokens";

// Built from the card's own two halves, so the alt text cannot describe a card
// that is no longer what gets rasterized.
export const alt = `aboard — ${site.ogHeadline} ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generate the image at build time (required by output: "export").
export const dynamic = "force-static";

export default async function Image() {
  const stats = {
    symptoms: graph.claims.filter((c) => c.kind === "symptom").length,
    mechanisms: graph.claims.filter((c) => c.kind === "mechanism").length,
    leverage: graph.claims.filter((c) => c.kind === "leverage_point").length,
  };

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
        {dotGrid(1200, 630)}

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
            domain · democratic_backsliding
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 60,
              fontWeight: 500,
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
              maxWidth: 980,
              color: surface.fg,
              display: "flex",
              flexWrap: "wrap",
            }}
          >
            <span>
              {site.ogHeadline}&nbsp;
              <span style={{ color: surface.muted, fontWeight: 400 }}>{site.tagline}</span>
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            zIndex: 1,
            fontSize: 18,
            letterSpacing: "0.04em",
          }}
        >
          {chip(`${stats.symptoms} symptoms`, kindPalette.symptom)}
          {chip(`${stats.mechanisms} mechanisms`, kindPalette.mechanism)}
          {chip(`${stats.leverage} leverage`, kindPalette.leverage_point)}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

function chip(text: string, c: { fg: string; bg: string; bd: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        background: c.bg,
        border: `1px solid ${c.bd}`,
        color: c.fg,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: c.fg,
        }}
      />
      <span>{text}</span>
    </div>
  );
}

function dotGrid(w: number, h: number) {
  const step = 32;
  const dots: React.ReactNode[] = [];
  for (let y = 16; y < h; y += step) {
    for (let x = 16; x < w; x += step) {
      dots.push(
        <div
          key={`${x},${y}`}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: 1.6,
            height: 1.6,
            background: surface.line2,
            borderRadius: 999,
          }}
        />
      );
    }
  }
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexWrap: "wrap",
        zIndex: 0,
      }}
    >
      {dots}
    </div>
  );
}
