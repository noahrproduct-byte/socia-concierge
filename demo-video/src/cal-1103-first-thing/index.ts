// Calendar post Tue Nov 3, 11:00 AM: the first thing Claude told me about my Instagram.
// npx remotion render src/cal-1103-first-thing/index.ts Cal1103FirstThing out/cal-1103-first-thing.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1103FirstThing", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
