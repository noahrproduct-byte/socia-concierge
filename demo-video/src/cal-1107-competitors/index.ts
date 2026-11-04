// Calendar post Sat Nov 7, 11:00 AM: "Want to see what's working for accounts like yours?"
// npx remotion render src/cal-1107-competitors/index.ts Cal1107Competitors out/cal-1107-competitors.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1107Competitors", component: Reel, durationInFrames: TOTAL_FRAMES, fps: 30, width: W, height: H });

registerRoot(Root);
