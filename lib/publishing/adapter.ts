// The one contract every platform publisher implements. The runner
// (lib/publishing/runner.ts) never branches on platform: it looks the adapter
// up here and calls it. Server only.
//
// Lifecycle an adapter drives:
//   publish()  : start the platform's publish from stored media (Instagram:
//                create container; YouTube: create the video resource and hand
//                the browser an upload session). Returns the next status.
//   poll()     : advance an "uploading" / "processing" job (Instagram: container
//                status then media_publish; YouTube: videos.list uploadStatus).
//   complete() : optional, for browser-side uploads reporting the external id.
//
// Outcomes never invent: a platform that answered nothing yet stays in flight.

import type { ContentItem, Destination, DestinationStatus, Platform } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type PublishOutcome = {
  status: DestinationStatus;
  externalPostId?: string | null;
  externalContainerId?: string | null;
  permalink?: string | null;
  /** Platform error code as a string ("190", "invalidTitle", ...). */
  errorCode?: string | null;
  /** Human sentence the UI shows verbatim, with the platform's own reason. */
  errorMessage?: string | null;
  /** When false the runner stops retrying (bad file, revoked token). */
  retryable?: boolean;
  /**
   * Work the browser must do to finish (YouTube resumable upload). The route
   * returns it to the client verbatim; the runner never blocks on it.
   */
  clientAction?: { kind: "youtube_resumable_upload"; sessionUri: string; accessToken: string; mediaId: string; videoId: string | null };
};

export type PublishContext = {
  /** Service-role or user client, whichever the caller holds. */
  supabase: Supa;
  userId: string;
  item: ContentItem;
  destination: Destination;
  /** Wall-clock budget in ms the adapter may spend polling before returning in-flight. */
  budgetMs: number;
  now: Date;
  /**
   * True when a signed-in browser is on the other end of this request and can
   * perform a clientAction (YouTube upload). The cron sets false; an adapter
   * that would need the browser must fail honestly instead of opening a
   * session nobody will finish.
   */
  interactive: boolean;
};

export interface PublishAdapter {
  platform: Platform;
  publish(ctx: PublishContext): Promise<PublishOutcome>;
  poll(ctx: PublishContext): Promise<PublishOutcome>;
  complete?(ctx: PublishContext, body: { externalPostId: string }): Promise<PublishOutcome>;
}

const registry = new Map<Platform, PublishAdapter>();

export function registerAdapter(a: PublishAdapter): void {
  registry.set(a.platform, a);
}

export function adapterFor(platform: Platform): PublishAdapter | null {
  return registry.get(platform) ?? null;
}

/** Outcome helper for a platform SOCIA cannot publish to; never retried. */
export function unavailable(message: string): PublishOutcome {
  return { status: "failed", errorCode: "unavailable", errorMessage: message, retryable: false };
}
