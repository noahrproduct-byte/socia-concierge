// "Connect Claude to your Instagram" reel (SOCIA as the connector): its own entry.
//   npm run render:claude-connect
import React from "react";
import { Composition, registerRoot } from "remotion";
import { ClaudeConnect } from "./ClaudeConnect";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "ClaudeConnect", component: ClaudeConnect, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
