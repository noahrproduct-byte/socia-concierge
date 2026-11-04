import React from "react";
import { Composition } from "remotion";
import { Halloween } from "./Halloween";

export const HalloweenRoot: React.FC = () => (
  <Composition id="HalloweenDemo" component={Halloween} durationInFrames={348} fps={30} width={1080} height={1920} />
);
