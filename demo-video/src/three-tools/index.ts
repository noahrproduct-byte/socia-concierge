// "3 tools" reel (Claude, SOCIA, ElevenLabs): its own entry.   npm run render:three-tools
import React from "react";
import { Composition, registerRoot } from "remotion";
import { ThreeTools } from "./ThreeTools";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "ThreeTools", component: ThreeTools, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
