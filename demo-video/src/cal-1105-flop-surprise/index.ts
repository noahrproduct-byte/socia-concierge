// Calendar post Thu Nov 5, 6:00 PM: ask Claude why your last Reel flopped; the surprise.
// npx remotion render src/cal-1105-flop-surprise/index.ts Cal1105FlopSurprise out/cal-1105-flop-surprise.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1105FlopSurprise", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
