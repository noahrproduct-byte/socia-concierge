// The composer's state contract and the pure helpers both halves of the UI
// share. The page owns one ComposerDraft; every section reads and updates it.
// No React here so it can be unit-tested and reused server-side to validate
// what the browser sends.
//
// API the composer talks to (implemented in app/api/posts/*):
//   GET  /api/publishing/accounts            -> { accounts: PickerAccount[] }
//   POST /api/posts                          -> body CreatePostPayload; { item, uploads?, plan? }
//   GET  /api/posts/:id                      -> { item }
//   POST /api/posts/:id/publish              -> { item, uploads? }  (publish now / schedule)
//   POST /api/posts/:id/destinations/:did/retry     -> { item, uploads? }
//   POST /api/posts/:id/destinations/:did/complete  -> body { externalPostId }; { item }
//   GET  /api/publishing/youtube/options     -> { playlists, categories }
//
// Client-safe.

import { PLATFORMS, defaultSettings, destinationKey, type ContentItem, type DestinationSettings, type MediaItem, type Platform, type InstagramSettings } from "./types";
import { availabilityFor, CAPABILITIES, type Availability } from "./capabilities";
import { validateDestination, effectiveCaption, type Readiness } from "./validate";

/** One connected account as the destination picker sees it. */
export type PickerAccount = {
  platform: Platform;
  accountId: string;
  label: string;
  handle: string | null;
  avatar: string | null;
  status: "connected" | "expired";
  suspended: boolean;
  scopes: string[] | null;
};

export type DraftDestination = {
  key: string;
  platform: Platform;
  accountId: string;
  enabled: boolean;
  settings: DestinationSettings;
  /** Per-platform time when schedule.sameForAll is false. */
  scheduledAt: string | null;
};

export type ScheduleMode = "now" | "later" | "recommended";

export type ComposerDraft = {
  postId: string | null;
  mode: "advanced" | "quick";
  masterCaption: string;
  customizePerPlatform: boolean;
  media: MediaItem[];
  destinations: DraftDestination[];
  schedule: { mode: ScheduleMode; at: string | null; sameForAll: boolean };
  source: ContentItem["source"];
  planId: string | null;
  planDay: string | null;
};

export function newDraft(mode: "advanced" | "quick" = "advanced"): ComposerDraft {
  return {
    postId: null, mode, masterCaption: "", customizePerPlatform: false, media: [], destinations: [],
    schedule: { mode: "later", at: null, sameForAll: true }, source: mode === "quick" ? "quick" : "composer", planId: null, planDay: null,
  };
}

/** Seed the destination list from the connected accounts; nothing is enabled by default. */
export function seedDestinations(accounts: PickerAccount[]): DraftDestination[] {
  return accounts.map((a) => ({
    key: destinationKey(a.platform, a.accountId), platform: a.platform, accountId: a.accountId, enabled: false,
    settings: defaultSettings(a.platform), scheduledAt: null,
  }));
}

export function availabilityOf(d: DraftDestination, accounts: PickerAccount[]): Availability {
  const a = accounts.find((x) => x.platform === d.platform && x.accountId === d.accountId) ?? null;
  return availabilityFor(d.platform, a ? { status: a.status, suspended: a.suspended, scopes: a.scopes } : null);
}

export const enabledDestinations = (draft: ComposerDraft) => draft.destinations.filter((d) => d.enabled);

/** The time a destination will publish at, honouring same-for-all. */
export function timeFor(draft: ComposerDraft, d: DraftDestination): string | null {
  if (draft.schedule.mode === "now") return null;
  if (draft.schedule.sameForAll) return draft.schedule.at;
  return d.scheduledAt ?? draft.schedule.at;
}

/** The caption this destination will carry, honouring the customize toggle. */
export function captionFor(draft: ComposerDraft, d: DraftDestination): string {
  const settings = draft.customizePerPlatform ? d.settings : stripOverrides(d.platform, d.settings);
  return effectiveCaption(d.platform, draft.masterCaption, settings);
}

/** When per-platform customisation is off, overrides are ignored (not deleted) so toggling back restores them. */
export function stripOverrides(platform: Platform, s: DestinationSettings): DestinationSettings {
  if (platform === "youtube") return { ...(s as DestinationSettings & { description: string | null }), description: null } as DestinationSettings;
  return { ...(s as DestinationSettings & { caption: string | null }), caption: null } as DestinationSettings;
}

export function readinessFor(draft: ComposerDraft, d: DraftDestination, accounts: PickerAccount[], now?: Date): Readiness {
  const availability = availabilityOf(d, accounts);
  if (availability.state !== "available") {
    return { level: "blocked", issues: [{ code: `platform_${availability.state}`, severity: "block", message: availability.reason ?? CAPABILITIES[d.platform].notes[0] }] };
  }
  const settings = draft.customizePerPlatform ? d.settings : stripOverrides(d.platform, d.settings);
  return validateDestination({
    platform: d.platform, media: draft.media, masterCaption: draft.masterCaption, settings,
    scheduledAt: timeFor(draft, d), requireFutureTime: draft.schedule.mode !== "now", now,
  });
}

export type ReviewRow = { key: string; platform: Platform; label: string; readiness: Readiness; at: string | null };

export function review(draft: ComposerDraft, accounts: PickerAccount[], now?: Date): { rows: ReviewRow[]; readyCount: number; total: number; canSubmit: boolean } {
  const rows = enabledDestinations(draft).map((d) => {
    const a = accounts.find((x) => x.platform === d.platform && x.accountId === d.accountId);
    return { key: d.key, platform: d.platform, label: a?.label ?? d.platform, readiness: readinessFor(draft, d, accounts, now), at: timeFor(draft, d) };
  });
  const readyCount = rows.filter((r) => r.readiness.level !== "blocked").length;
  return { rows, readyCount, total: rows.length, canSubmit: rows.length > 0 && readyCount === rows.length };
}

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

export type CreatePostPayload = {
  id: string | null;
  caption: string;
  media: MediaItem[];
  scheduledAt: string | null;
  source: ContentItem["source"];
  planId: string | null;
  planDay: string | null;
  customizePerPlatform: boolean;
  destinations: { platform: Platform; accountId: string; settings: DestinationSettings; scheduledAt: string | null }[];
  /** draft = save only; schedule = validate + schedule; publish = validate + publish now */
  action: "draft" | "schedule" | "publish";
};

export function toPayload(draft: ComposerDraft, action: CreatePostPayload["action"]): CreatePostPayload {
  return {
    id: draft.postId,
    caption: draft.masterCaption,
    media: draft.media.map(({ id, kind, name, mime, size, width, height, duration, path, url }) => ({ id, kind, name, mime, size, width, height, duration, path, url })),
    scheduledAt: draft.schedule.mode === "now" ? null : draft.schedule.at,
    source: draft.source,
    planId: draft.planId,
    planDay: draft.planDay,
    customizePerPlatform: draft.customizePerPlatform,
    destinations: enabledDestinations(draft).map((d) => ({
      platform: d.platform, accountId: d.accountId,
      settings: draft.customizePerPlatform ? d.settings : stripOverrides(d.platform, d.settings),
      scheduledAt: timeFor(draft, d),
    })),
    action,
  };
}

/** Rebuild a draft from a stored item (edit / draft recovery). */
export function fromItem(item: ContentItem, accounts: PickerAccount[]): ComposerDraft {
  const seeded = seedDestinations(accounts);
  for (const d of item.destinations) {
    const k = destinationKey(d.platform, d.accountId);
    const existing = seeded.find((s) => s.key === k);
    const row: DraftDestination = { key: k, platform: d.platform, accountId: d.accountId, enabled: d.status !== "cancelled", settings: d.settings, scheduledAt: d.scheduledAt };
    if (existing) Object.assign(existing, row); else seeded.push(row);
  }
  const times = new Set(item.destinations.map((d) => d.scheduledAt ?? item.scheduledAt ?? ""));
  const customized = item.destinations.some((d) => (d.platform === "youtube" ? (d.settings as { description: string | null }).description != null : (d.settings as { caption?: string | null }).caption != null));
  return {
    postId: item.id, mode: "advanced", masterCaption: item.caption, customizePerPlatform: customized, media: item.media,
    destinations: seeded,
    schedule: { mode: item.scheduledAt ? "later" : "later", at: item.scheduledAt, sameForAll: times.size <= 1 },
    source: item.source, planId: item.planId, planDay: item.planDay,
  };
}

/** Instagram's format choice should follow the media the person added. */
export function suggestInstagramFormat(media: MediaItem[]): InstagramSettings["format"] {
  if (media.length >= 2 && media.every((m) => m.kind === "image")) return "carousel";
  if (media[0]?.kind === "image") return "image";
  return "reel";
}

export const ALL_PLATFORMS = PLATFORMS;
