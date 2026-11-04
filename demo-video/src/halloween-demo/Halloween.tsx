// Demonstration edit for Noah (2026-11-02): how a "POV: you walk into work on
// Halloween" brief should be cut from his three clips. The cut itself is made
// with ffmpeg (public/halloween-demo/cut.mp4); this adds the on-screen text in
// SOCIA's default look (Inter on a dark box).
import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });

const BEATS = [
  { from: 0, to: 2.2, text: "POV: you walk into work on Halloween" },
  { from: 2.4, to: 5.8, text: "The tickets don't stop" },
  { from: 9.2, to: 11.6, text: "Every rack full" },
];

function Line({ text, frames }: { text: string; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 8 });
  const out = interpolate(frame, [frames - 5, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 330, paddingLeft: 90, paddingRight: 90 }}>
      <div
        style={{
          fontFamily, fontWeight: 700, fontSize: 68, lineHeight: 1.18, color: "#fff", textAlign: "center",
          background: "rgba(17,17,17,0.82)", borderRadius: 22, padding: "22px 34px", maxWidth: 900,
          opacity: pop * out, transform: `translateY(${(1 - pop) * 14}px)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

export const Halloween: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo src={staticFile("halloween-demo/cut.mp4")} />
      {BEATS.map((b) => {
        const frames = Math.round((b.to - b.from) * fps);
        return (
          <Sequence key={b.text} from={Math.round(b.from * fps)} durationInFrames={frames}>
            <Line text={b.text} frames={frames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
