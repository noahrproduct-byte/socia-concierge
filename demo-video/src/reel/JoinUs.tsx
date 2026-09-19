// 4-second investor closer: "Will you join us on our journey?"

import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Bg, Lockup, Title } from "./ScreenDemo";
import { FPS } from "../timeline";

export const JOIN_US_FRAMES = 4 * FPS;

export const JoinUs: React.FC = () => {
  const { width: w, height: h } = useVideoConfig();
  const f = useCurrentFrame();
  const size = { w, h };
  // slow settle on the whole frame so the hold never feels frozen
  const zoom = interpolate(f, [0, JOIN_US_FRAMES], [1.04, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#0B1220" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Bg size={size} hot={1} />
      </AbsoluteFill>
      <div style={{ position: "absolute", top: h * 0.2, left: 0, width: w, display: "flex", justifyContent: "center" }}>
        <Lockup size={h * 0.075} />
      </div>
      <Title size={size} lines={[[{ t: "Will you join us" }], [{ t: "on our", i: true }, { t: "journey?", a: true }]]} y={h * 0.4} scale={1.15} from={Math.round(0.35 * FPS)} />
    </AbsoluteFill>
  );
};
