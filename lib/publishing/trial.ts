// Trial Reels as SOCIA records them: what was asked for when the post was
// submitted (the destination's settings), never a claim about what Instagram
// did afterwards. Instagram reports no "shared with everyone" state, so the
// wording says what SOCIA can't see. Client-safe; used by the composer's
// status rail, the Calendar and the analytics post views.
import type { DestinationSettings, InstagramSettings, Platform, TrialShare } from "./types";

/** The Trial Reel choice on a destination, or null for anything that isn't one. */
export function trialOf(platform: Platform, settings: DestinationSettings | null | undefined): TrialShare | null {
  if (platform !== "instagram" || !settings) return null;
  const s = settings as InstagramSettings;
  return s.format === "reel" && s.trial?.share ? s.trial.share : null;
}

export const TRIAL_SHARE_TEXT: Record<TrialShare, string> = {
  manual: "You share it with everyone from the Reel in the Instagram app.",
  if_performing: "Instagram shares it with everyone automatically if it performs well.",
};

/** One sentence for a Trial Reel; after publishing it adds what SOCIA can't see. */
export function trialLine(share: TrialShare, published: boolean): string {
  return `Trial Reel: shown to non-followers first. ${TRIAL_SHARE_TEXT[share]}${published ? " SOCIA can't see whether it has been shared with everyone." : ""}`;
}
