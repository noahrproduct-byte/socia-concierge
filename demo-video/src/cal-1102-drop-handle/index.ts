// Calendar post Mon Nov 2, 7:00 PM: "Drop your handle below."
// npx remotion render src/cal-1102-drop-handle/index.ts Cal1102DropHandle out/cal-1102-drop-handle.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1102DropHandle", component: Reel, durationInFrames: TOTAL_FRAMES, fps: 30, width: W, height: H });

registerRoot(Root);
