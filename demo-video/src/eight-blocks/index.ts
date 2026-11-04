// "8 blocks" reel with a SOCIA ending: its own entry.   npm run render:eight-blocks
import React from "react";
import { Composition, registerRoot } from "remotion";
import { EightBlocks } from "./EightBlocks";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "EightBlocks", component: EightBlocks, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
