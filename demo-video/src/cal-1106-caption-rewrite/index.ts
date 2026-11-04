// Calendar post Fri Nov 6, 6:00 PM: "Paste in a weak caption, get a sharper one out."
// npx remotion render src/cal-1106-caption-rewrite/index.ts Cal1106CaptionRewrite out/cal-1106-caption-rewrite.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1106CaptionRewrite", component: Reel, durationInFrames: TOTAL_FRAMES, fps: 30, width: W, height: H });

registerRoot(Root);
