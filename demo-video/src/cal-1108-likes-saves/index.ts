// Calendar post Sun Nov 8, 6:00 PM ("Likes feel good. Saves tell you what people want to keep.").
// npx remotion render src/cal-1108-likes-saves/index.ts Cal1108LikesSaves out/cal-1108-likes-saves.mp4 --concurrency=3
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Cal1108LikesSaves", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
