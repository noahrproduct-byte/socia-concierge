"use client";

// The storyboard review on the Studio lab's fixture cut. Development only (app/dev/board-lab).
import StoryboardReview from "./StoryboardReview";
import { BUILD_ID, playerData } from "./labFixtures";

export default function BoardLab() {
  return <StoryboardReview buildId={BUILD_ID} title="Friday shoot" initial={playerData([], 12)} onDone={() => {}} onClose={() => {}} />;
}
