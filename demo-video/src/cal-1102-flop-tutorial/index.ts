// Calendar post Mon Nov 2, 12:00 PM: ask Claude why your last Reel flopped (tutorial).
// npx remotion render src/cal-1102-flop-tutorial/index.ts Cal1102FlopTutorial out/cal-1102-flop-tutorial.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1102FlopTutorial", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
