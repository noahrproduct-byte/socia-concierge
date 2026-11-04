// Calendar post Fri Nov 6, 11:00 AM: "Same idea, three hooks. Which one would stop your scroll?"
// npx remotion render src/cal-1106-three-hooks/index.ts Cal1106ThreeHooks out/cal-1106-three-hooks.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1106ThreeHooks", component: Reel, durationInFrames: TOTAL_FRAMES, fps: 30, width: W, height: H });

registerRoot(Root);
