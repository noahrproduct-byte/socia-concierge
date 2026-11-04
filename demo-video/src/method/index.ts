// Own entry point: the method reel does not need the Playwright captures the
// demo compositions import, so it bundles without them.
//   npx remotion render src/method/index.ts SociaMethod out/socia-method.mp4
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Method } from "./Method";
import { FPS, H, TOTAL_FRAMES, W } from "./script";

const Root: React.FC = () => React.createElement(Composition, { id: "SociaMethod", component: Method, durationInFrames: TOTAL_FRAMES, fps: FPS, width: W, height: H });

registerRoot(Root);
