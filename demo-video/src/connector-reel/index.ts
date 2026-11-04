// "Connector reel" (reference instagram.com/reel/De6Rc7GCGnm).   npm run render:connector-reel
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "ConnectorReel", component: Reel, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
