import React from "react";
import { Composition } from "remotion";
import { Demo } from "./Demo";
import { FPS, TOTAL_FRAMES } from "./timeline";
import { Reel } from "./reel/Laptop";
import { ScreenDemo, SCREEN_FRAMES } from "./reel/ScreenDemo";
import { JoinUs, JOIN_US_FRAMES } from "./reel/JoinUs";

const Wide: React.FC = () => <ScreenDemo w={1920} h={1080} />;

export const RemotionRoot: React.FC = () => (
  <>
    {/* laptop-in-a-dark-room reel (matches the reference cut) */}
    <Composition
      id="SociaDemoVertical"
      component={Reel}
      durationInFrames={SCREEN_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ caption: "POV: an AI just audited your Instagram and told you what to post next" }}
    />
    {/* the on-screen demo itself, full-frame 16:9 */}
    <Composition id="SociaDemoWide" component={Wide} durationInFrames={SCREEN_FRAMES} fps={FPS} width={1920} height={1080} />

    {/* 4s investor closer */}
    <Composition id="JoinUs" component={JoinUs} durationInFrames={JOIN_US_FRAMES} fps={FPS} width={1920} height={1080} />

    {/* v1 — the 30s storyboard cut */}
    <Composition id="SociaDemoVerticalV1" component={Demo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={{ layout: "vertical" as const }} />
    <Composition id="SociaDemoWideV1" component={Demo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ layout: "wide" as const }} />
  </>
);
