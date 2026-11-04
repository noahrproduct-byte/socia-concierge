// The SOCIA agent reel (Harvey-style): its own entry so it bundles without the
// demo captures.   npm run render:agent
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Agent } from "./Agent";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "SociaAgent", component: Agent, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
