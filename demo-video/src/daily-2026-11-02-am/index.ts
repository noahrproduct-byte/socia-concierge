// Daily reel 2026-11-02 AM (myth vs fact).   npm run render:daily-2026-11-02-am
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "Daily20261102AM", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
