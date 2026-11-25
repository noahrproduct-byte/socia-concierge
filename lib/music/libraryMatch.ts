"use client";
// The person's own sounds against the reference's music, in this browser: each sound's
// levels and beat come from lib/studioClips/beatClient.ts (measured once per sound per tab),
// and lib/music/referenceMusic.ts lines each up with the reference. Free: nothing is uploaded.
import { analysisOfTrack } from "@/lib/studioClips/beatClient";
import { envelopeFromRms, rankForReference, type Ranked, type ReferenceMusic } from "./referenceMusic";
import type { Track } from "./tracks";

/** Sounds checked without asking: the newest this many (each is downloaded to be measured). */
export const AUTO_CHECK = 12;

export type LibraryMatch = Ranked & { track: Track; bpm: number | null };

/** The first `limit` playable sounds ranked against the reference, closest first. */
export async function rankLibrary(music: ReferenceMusic, tracks: Track[], limit = AUTO_CHECK): Promise<{ ranked: LibraryMatch[]; checked: number }> {
  const pool = tracks.filter((t) => t.url).slice(0, limit);
  const read = await Promise.all(pool.map(async (track) => ({ track, a: await analysisOfTrack(track.url!).catch(() => null) })));
  const ok = read.filter((r): r is { track: Track; a: NonNullable<typeof r.a> } => Boolean(r.a));
  const byId = new Map(ok.map((r) => [r.track.id, r]));
  const ranked = rankForReference(music, ok.map((r) => ({ id: r.track.id, env: envelopeFromRms(r.a.rms), bpm: r.a.beat?.bpm ?? null })));
  return { ranked: ranked.map((r) => ({ ...r, track: byId.get(r.id)!.track, bpm: byId.get(r.id)!.a.beat ? Math.round(byId.get(r.id)!.a.beat!.bpm) : null })), checked: pool.length };
}
