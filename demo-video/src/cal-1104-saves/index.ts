// Calendar post Wed Nov 4, 11:00 AM ("This Reel got 32 saves..." -> real count 41, Nov 2).
// npx remotion render src/cal-1104-saves/index.ts Cal1104Saves out/cal-1104-saves.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1104Saves", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
