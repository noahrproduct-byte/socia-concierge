// The frozen measurement stored with a post deleted from its platform
// (post_destinations.deleted_result, scheduled_posts.deleted_result).
// Client-safe: no imports beyond types.

import type { Measurement } from "../postResults";

export type FrozenResult = Measurement & { measuredAt: string };

/** A frozen measurement written by lib/platformDelete, or null when absent or unreadable. */
export function deletedResultFromJson(v: unknown): FrozenResult | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.measuredAt !== "string" || typeof o.platform !== "string" || typeof o.found !== "boolean") return null;
  return o as unknown as FrozenResult;
}

