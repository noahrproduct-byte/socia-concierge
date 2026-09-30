import { ImageResponse } from "next/og";

// The card link unfurlers show for sociaos.com. Generated (no static asset) so
// it stays on-brand and in one place. 1200x630 is the size X/Slack/LinkedIn
// crop to. Pure inline styles — ImageResponse supports a flexbox subset only,
// so every element with more than one child is display:flex on purpose.

export const runtime = "edge";
export const alt = "SOCIA — Your AI Social Strategist";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #0b1220 0%, #171a3a 55%, #2a1f5e 100%)",
          fontFamily: "sans-serif",
          color: "#eef1f8",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #5b4bd6, #9c90ff)",
              color: "#fff",
              fontSize: 46,
              fontWeight: 800,
            }}
          >
            S
          </div>
          <div style={{ display: "flex", marginLeft: 22, fontSize: 40, fontWeight: 800, letterSpacing: "-1px" }}>SOCIA</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 62, fontWeight: 800, letterSpacing: "-2px", lineHeight: 1.1, maxWidth: 900 }}>
            Know what to post before you post it.
          </div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 28, color: "#a6afc3", maxWidth: 880, lineHeight: 1.4 }}>
            Your AI social strategist — content, audience and competitors, turned into what to post and when.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: "#7b8499", fontWeight: 600 }}>
          sociaos.com
        </div>
      </div>
    ),
    { ...size },
  );
}
