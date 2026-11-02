// Browser side of scheduling one post: the same POST /api/posts call Create
// Post makes (action "schedule"; the server validates every destination),
// then any YouTube upload the server asks for, from this browser, confirmed
// or reported failed so no row is left "uploading". Used by Make and
// schedule and by Ask SOCIA's schedule proposals.
import { relayEndpoint, uploadToYouTube } from "./youtubeUpload";
import type { DestinationSettings, Platform } from "./types";

export type ScheduleMedia = { id: string; kind: "video" | "image"; name: string; mime: string; size: number | null; width: number | null; height: number | null; duration: number | null; path: string | null };
export type ScheduleRequest = {
  postId: string | null;
  caption: string;
  media: ScheduleMedia[];
  /** ISO instant */
  at: string;
  destinations: { platform: Platform; accountId: string; settings: DestinationSettings }[];
  source?: "studio" | "calendar" | "composer";
  /** the video in memory, when this browser just made it; otherwise it is fetched from mediaUrl */
  blob?: Blob | null;
  mediaUrl?: string | null;
};
export type ScheduleResult = { ok: boolean; text: string; postId: string | null };

const completeUrl = (postId: string, destinationId: string) => `/api/posts/${encodeURIComponent(postId)}/destinations/${encodeURIComponent(destinationId)}/complete`;

export async function schedulePost(r: ScheduleRequest): Promise<ScheduleResult> {
  let res: Response;
  try {
    res = await fetch("/api/posts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: r.postId, caption: r.caption, scheduledAt: r.at, source: r.source ?? "studio", planId: null, planDay: null, customizePerPlatform: false, action: "schedule",
        media: r.media, destinations: r.destinations.map((d) => ({ ...d, scheduledAt: r.at })),
      }),
    });
  } catch {
    return { ok: false, text: "Couldn't reach SOCIA. Nothing changed.", postId: r.postId };
  }
  const j = (await res.json().catch(() => null)) as { error?: string; issues?: Record<string, { message: string }[]>; item?: { id: string }; uploads?: { destinationId: string; uploadHandle: string }[] } | null;
  if (!res.ok || !j?.item) {
    const issues = j?.issues ? Object.values(j.issues).flat().map((i) => i.message) : [];
    return { ok: false, text: [j?.error ?? "Couldn't schedule it.", ...issues].join(" "), postId: r.postId };
  }
  const postId = j.item.id;
  // YouTube holds a scheduled video privately until its time; the bytes go from this browser now.
  const notes: string[] = [];
  for (const u of j.uploads ?? []) {
    try {
      const blob = r.blob ?? (r.mediaUrl ? await (await fetch(r.mediaUrl)).blob() : null);
      if (!blob) throw new Error("the video file isn't available in this browser");
      const { videoId } = await uploadToYouTube({ endpoint: relayEndpoint(postId, u.destinationId), handle: u.uploadHandle, blob });
      await fetch(completeUrl(postId, u.destinationId), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ externalPostId: videoId }) });
    } catch (e) {
      const msg = (e as Error)?.message || "The upload did not complete.";
      await fetch(completeUrl(postId, u.destinationId), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ error: msg }) }).catch(() => null);
      notes.push(`The YouTube upload didn't finish (${msg}); open the post to upload it again.`);
    }
  }
  return { ok: notes.length === 0, text: notes.length ? `Scheduled. ${notes.join(" ")}` : "Scheduled.", postId };
}

/**
 * Put a post on the calendar as a DRAFT at a time, with or without media: a
 * video idea to make later, or a draft whose video isn't made yet. Nothing
 * publishes; the person adds the video and schedules it in Create Post.
 */
export async function placeDraft(r: { postId: string | null; caption: string; media: ScheduleMedia[]; at: string; destinations: ScheduleRequest["destinations"]; source?: string }): Promise<ScheduleResult> {
  let res: Response;
  try {
    res = await fetch("/api/posts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: r.postId, caption: r.caption, scheduledAt: r.at, source: r.source ?? "assistant", planId: null, planDay: null, customizePerPlatform: false, action: "draft",
        media: r.media, destinations: r.destinations.map((d) => ({ ...d, scheduledAt: r.at })),
      }),
    });
  } catch {
    return { ok: false, text: "Couldn't reach SOCIA. Nothing changed.", postId: r.postId };
  }
  const j = (await res.json().catch(() => null)) as { error?: string; item?: { id: string } } | null;
  if (!res.ok || !j?.item) return { ok: false, text: j?.error ?? "Couldn't put it on the Calendar.", postId: r.postId };
  return { ok: true, text: "On the Calendar as a draft. Add the video when it's made, then schedule it.", postId: j.item.id };
}
