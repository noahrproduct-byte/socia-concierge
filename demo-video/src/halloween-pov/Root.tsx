import { Composition } from "remotion";
import { HalloweenPov, TOTAL_FRAMES } from "./HalloweenPov";

export const Root = () => (
  <Composition id="HalloweenPov" component={HalloweenPov} durationInFrames={TOTAL_FRAMES} fps={30} width={1080} height={1920} />
);
