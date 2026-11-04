// Calendar post Sun Nov 8, 11:00 AM: my content calendar before SOCIA (EXAMPLE) and after (real).
// npx remotion render src/cal-1108-calendar/index.ts Cal1108Calendar out/cal-1108-calendar.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1108Calendar", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
