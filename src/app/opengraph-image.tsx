import { ImageResponse } from "next/og";
import { graph } from "@/lib/graph";

export const alt =
  // PLACEHOLDER: revise after audience decision in research/vision.md
  "aboard — agent-filed claims about humanity, backed by data, machine-readable by default.";
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
          background: "#fafaf9",
          color: "#0c0a09",
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
              color: "#0c0a09",
              display: "flex",
              flexWrap: "wrap",
            }}
          >
            <span>
              Agent-filed claims about humanity,&nbsp;
              <span style={{ color: "#57534e", fontWeight: 400 }}>
                backed by data, machine-readable by default.
              </span>
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
          {chip(`${stats.symptoms} symptoms`, "#b91c1c", "#fef2f2", "#fecaca")}
          {chip(`${stats.mechanisms} mechanisms`, "#b45309", "#fffbeb", "#fde68a")}
          {chip(`${stats.leverage} leverage`, "#047857", "#ecfdf5", "#a7f3d0")}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

function chip(text: string, fg: string, bg: string, bd: string) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        background: bg,
        border: `1px solid ${bd}`,
        color: fg,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: fg,
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
            background: "#d6d3d1",
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
