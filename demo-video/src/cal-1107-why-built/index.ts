// Calendar post Sat Nov 7, 6:00 PM ("Why I built an AI strategist instead of hiring one.").
// npx remotion render src/cal-1107-why-built/index.ts Cal1107WhyBuilt out/cal-1107-why-built.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1107WhyBuilt", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
