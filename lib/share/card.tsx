// The shareable image itself (app/api/share/result): 1080 x 1350, drawn with
// next/og. ImageResponse lays out with flexbox only, so every element with
// more than one child is display:flex. Server only.
import { ImageResponse } from "next/og";
import { platformName, winSentence, type Win } from "./core";

const INK = "#151515", SOFT = "#5F5E5A", PAPER = "#F5F4F1", LINE = "#D9D6CE";

export function resultCard(win: Win, brand: string): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 96, background: PAPER, color: INK, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 40, color: SOFT }}>{brand || platformName(win.platform)}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 300, fontWeight: 700, lineHeight: 1, letterSpacing: -8 }}>{win.multiple}</div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, marginTop: 24 }}>{`my usual ${win.metric}`}</div>
          <div style={{ display: "flex", fontSize: 40, lineHeight: 1.35, color: SOFT, marginTop: 40, maxWidth: 860 }}>{winSentence(win)}</div>
          {win.title ? <div style={{ display: "flex", fontSize: 40, lineHeight: 1.35, marginTop: 40, paddingLeft: 28, borderLeft: `6px solid ${INK}`, maxWidth: 860 }}>{win.title}</div> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${LINE}`, paddingTop: 36, fontSize: 34, color: SOFT }}>
          <div style={{ display: "flex" }}>Planned with SOCIA</div>
          <div style={{ display: "flex" }}>sociaos.com</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "content-disposition": 'inline; filename="socia-result.png"', "cache-control": "private, no-store" } },
  );
}
