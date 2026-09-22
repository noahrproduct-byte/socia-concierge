// Shared contract between the composer page (state owner, left column) and the
// right rail (preview, readiness, check, scheduling, review, status). Both are
// built against this file; neither imports the other's internals.
//
// Client-safe. No React here; the reducer is pure so it is unit-testable.

import type { ComposerDraft, PickerAccount } from "@/lib/publishing/composer";
import type { ContentItem, DestinationSettings, MediaItem } from "@/lib/publishing/types";
import type { PlanError } from "@/lib/planErrors";
import type { TimedPost } from "@/lib/postingTimes";

export type ComposerAction =
  | { type: "load"; draft: ComposerDraft }
  | { type: "set_post_id"; id: string }
  | { type: "set_mode"; mode: "advanced" | "quick" }
  | { type: "set_caption"; caption: string }
  | { type: "toggle_customize"; on: boolean }
  | { type: "toggle_destination"; key: string; enabled: boolean }
  | { type: "set_settings"; key: string; settings: DestinationSettings }
  | { type: "set_destination_time"; key: string; at: string | null }
  | { type: "set_media"; media: MediaItem[] }
  | { type: "add_media"; items: MediaItem[] }
  | { type: "update_media"; id: string; patch: Partial<MediaItem> }
  | { type: "remove_media"; id: string }
  | { type: "set_schedule"; schedule: Partial<ComposerDraft["schedule"]> };

export function reduce(draft: ComposerDraft, action: ComposerAction): ComposerDraft {
  switch (action.type) {
    case "load": return action.draft;
    case "set_post_id": return { ...draft, postId: action.id };
    case "set_mode": return { ...draft, mode: action.mode, source: action.mode === "quick" ? "quick" : draft.source === "quick" ? "composer" : draft.source };
    case "set_caption": return { ...draft, masterCaption: action.caption };
    case "toggle_customize": return { ...draft, customizePerPlatform: action.on };
    case "toggle_destination":
      return { ...draft, destinations: draft.destinations.map((d) => (d.key === action.key ? { ...d, enabled: action.enabled } : d)) };
    case "set_settings":
      return { ...draft, destinations: draft.destinations.map((d) => (d.key === action.key ? { ...d, settings: action.settings } : d)) };
    case "set_destination_time":
      return { ...draft, destinations: draft.destinations.map((d) => (d.key === action.key ? { ...d, scheduledAt: action.at } : d)) };
    case "set_media": return { ...draft, media: action.media };
    case "add_media": return { ...draft, media: [...draft.media, ...action.items] };
    case "update_media": return { ...draft, media: draft.media.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m)) };
    case "remove_media": return { ...draft, media: draft.media.filter((m) => m.id !== action.id) };
    case "set_schedule": return { ...draft, schedule: { ...draft.schedule, ...action.schedule } };
    default: return draft;
  }
}

/** A browser-side upload the server asked for (YouTube resumable session). */
export type ClientUpload = {
  destinationId: string;
  kind: "youtube_resumable_upload";
  sessionUri: string;
  accessToken: string;
  mediaId: string;
};

export type SubmissionPhase = "idle" | "saving" | "submitting" | "uploading" | "tracking" | "done" | "error";

export type SubmissionState = {
  phase: SubmissionPhase;
  /** The item as the server last returned it (with destinations and their statuses). */
  item: ContentItem | null;
  uploads: ClientUpload[];
  /** Upload progress per destination id, 0..1. */
  progress: Record<string, number>;
  error: string | null;
  planError: PlanError | null;
};

export const idleSubmission = (): SubmissionState => ({ phase: "idle", item: null, uploads: [], progress: {}, error: null, planError: null });

/** Real posting history the check and scheduling sections may cite. null = no connected Instagram. */
export type TimingInput = {
  instagram: { timed: TimedPost[] } | null;
};

/** What the page passes to every right-rail section. */
export type RailProps = {
  draft: ComposerDraft;
  accounts: PickerAccount[];
  dispatch: (a: ComposerAction) => void;
  timing: TimingInput;
  submission: SubmissionState;
  /** draft = save only; schedule = validate + schedule; publish = validate + publish now */
  onSubmit: (action: "draft" | "schedule" | "publish") => Promise<void>;
  onRetry: (destinationId: string) => Promise<void>;
  /** Return from the status view to editing. */
  onEdit: () => void;
  /** Focus a left-column field named by an Issue.field (e.g. "title", "media"). */
  onFocusField: (destinationKey: string | null, field: string) => void;
};

/** What the server page hands the client composer. */
export type ComposerPageProps = {
  userId: string;
  accounts: PickerAccount[];
  /** false when a connections table could not be read: the list is a lower bound, not the truth. */
  accountsComplete: boolean;
  timing: TimingInput;
  /** Editing an existing item, or prefill from Studio / Content Plan / a calendar day (`at`, ISO). */
  initial: { item: ContentItem | null; caption: string | null; planId: string | null; planDay: string | null; source: ComposerDraft["source"]; mode: "advanced" | "quick"; at: string | null };
  /** Whether this plan may schedule/publish at all (Free cannot); the server enforces regardless. */
  canPublish: boolean;
  planError: PlanError | null;
  /** True when post_destinations exists (migration run); false shows a calm "not ready on this server" notice. */
  ready: boolean;
};
