// Calendar post Wed Nov 4, 6:00 PM: the real weekly Content Plan, start to finish.
// npx remotion render src/cal-1104-week-plan/index.ts Cal1104WeekPlan out/cal-1104-week-plan.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1104WeekPlan", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
