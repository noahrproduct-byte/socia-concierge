// The brand voice handed to the comment-reply drafter, assembled defensively
// from whatever the profile / workspace actually recorded. Anything missing is
// null — the prompt then falls back to neutral wording rather than inventing a
// brand personality.

import type { BrandVoice } from "./commentDrafts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProfileLike = any;

export function brandVoiceFrom(profile: ProfileLike, workspaceName: string | null): BrandVoice {
  const bd = (profile?.brand_detail ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const name = str(bd.name) ?? str(profile?.brand_name) ?? str(profile?.business_name) ?? workspaceName ?? null;
  const niche = str(profile?.niche) ?? str(bd.niche) ?? null;
  const location = str(bd.location) ?? null;
  // The fields Settings actually records (lib/profile.ts BrandDetail): voice,
  // description and the words or topics to avoid. There is no "tone" field.
  const voice = str(bd.voice);
  const avoid = str(bd.avoid);
  const notesParts = [voice ? `Voice: ${voice}` : null, str(bd.description), str(profile?.goals), avoid ? `Never mention: ${avoid}` : null].filter((s): s is string => Boolean(s));
  return { name, niche, location, notes: notesParts.length ? notesParts.join(" · ").slice(0, 600) : null };
}
