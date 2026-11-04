// Calendar post Sun Nov 1, 6:00 PM ("Stop guessing when to post. Ask your own data.").
// npx remotion render src/cal-1101-best-time/index.ts Cal1101BestTime out/cal-1101-best-time.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1101BestTime", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
