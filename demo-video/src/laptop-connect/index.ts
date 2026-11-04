// "Laptop connect" reel (Claude + SOCIA setup tutorial, all features): its own entry.
//   npm run render:laptop-connect
import React from "react";
import { Composition, registerRoot } from "remotion";
import { LaptopConnect } from "./LaptopConnect";
import { FPS, H, TOTAL_FRAMES, W } from "./story";

const Root: React.FC = () => React.createElement(Composition, { id: "LaptopConnect", component: LaptopConnect, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
