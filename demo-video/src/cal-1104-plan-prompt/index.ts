// Calendar post Wed Nov 4, 7:00 PM: the exact Claude prompt for next week's content plan.
// npx remotion render src/cal-1104-plan-prompt/index.ts Cal1104PlanPrompt out/cal-1104-plan-prompt.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1104PlanPrompt", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
