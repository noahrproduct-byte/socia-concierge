"use client";

// Music for this cut (Growth/Pro): a playlist of original tracks SOCIA makes
// from the account's taste (what its best posts sound like, whether music or
// original sound has done better, and the tracks picked before). Each track
// is listened to here; the chosen one is mixed into the cut at the two levels
// the person sets (music, and the clips' own sound). Beside it, a few sounds
// to search for in Instagram's or TikTok's own libraries, which only those
// apps can add.
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, ListMusic, Loader2, RefreshCw, X } from "lucide-react";
import PlanNotice from "../PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import type { Edl } from "@/lib/studioClips/types";
import type { Playlist, Soundtrack } from "@/lib/music/taste";
import { DUCK } from "@/lib/studioClips/musicDuck";

type TrackStatus = { state: "waiting" | "making" | "ready" | "failed"; error: string | null };
const PARALLEL = 2;

export default function MusicPlaylist({ buildId, edl, canEdit, trackUrls, onTrackUrl, onPlaylist, onSoundtrack, onLevels, onDuck, speechPct = 0, autoAdding = false }: {
  buildId: string;
  edl: Edl;
  canEdit: boolean;
  trackUrls: Record<string, string>;
  onTrackUrl: (trackId: string, url: string) => void;
  /** the server saved a new playlist on the cut */
  onPlaylist: (p: Playlist) => void;
  /** the server set (or, with null, removed) the cut's soundtrack */
  onSoundtrack: (s: Soundtrack | null) => void;
  /** the person moved a level slider (one undo step; saved with the cut) */
  onLevels: (musicVolume: number, originalVolume: number) => void;
  /** the person switched "lower the music under speech" on or off (saved with the cut) */
  onDuck: (on: boolean) => void;
  /** how much of the cut has speech, 0..100 from the transcript; 0 when nobody speaks */
  speechPct?: number;
  /** SOCIA is adding a track on its own right now */
  autoAdding?: boolean;
}) {
  const playlist = edl.playlist ?? null;
  const st = edl.soundtrack ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [status, setStatus] = useState<Record<string, TrackStatus>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const running = useRef(false);

  // Make these tracks of the playlist (those not made yet), two at a time; each one is counted on its own.
  const make = useCallback(async (list: Playlist["tracks"]) => {
    if (running.current) return;
    running.current = true;
    const queue = list.filter((t) => !trackUrls[t.id]);
    setStatus((s) => ({ ...s, ...Object.fromEntries(queue.map((t) => [t.id, { state: "waiting", error: null } as TrackStatus])) }));
    let stop = false;
    const worker = async () => {
      while (queue.length && !stop) {
        const t = queue.shift()!;
        setStatus((s) => ({ ...s, [t.id]: { state: "making", error: null } }));
        const res = await fetch(`/api/studio/builds/${buildId}/music/${t.id}`, { method: "POST" }).catch(() => null);
        const j = res ? ((await res.json().catch(() => null)) as { url?: string | null; error?: string; notConfigured?: boolean } | null) : null;
        if (res?.ok && j?.url) { onTrackUrl(t.id, j.url); setStatus((s) => ({ ...s, [t.id]: { state: "ready", error: null } })); continue; }
        if (isPlanError(j)) { setPlanError(j); stop = true; }
        // The music service itself isn't available: no point asking for the rest.
        else if (j?.notConfigured) { setNotReady(true); stop = true; }
        setStatus((s) => ({ ...s, [t.id]: { state: "failed", error: j?.error ?? "Couldn't make this track." } }));
      }
      for (const t of queue) setStatus((s) => ({ ...s, [t.id]: { state: "failed", error: "Not made." } }));
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    running.current = false;
  }, [buildId, trackUrls, onTrackUrl]);

  const makeMissing = useCallback((p: Playlist) => make(p.tracks), [make]);
  // A playlist the person asked for (and saved on the cut) finishes any track that wasn't made.
  // One SOCIA made on its own made only the track it added: the others are made when asked for.
  const autoMade = Boolean(edl.musicAuto);
  useEffect(() => {
    if (playlist && canEdit && !autoMade && playlist.tracks.some((t) => !trackUrls[t.id]) && !Object.keys(status).length) void makeMissing(playlist);
    // Once, when the panel opens on a playlist with tracks still to make.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist?.createdAt]);

  const newPlaylist = async () => {
    setBusy(true); setError(null); setPlanError(null);
    const res = await fetch(`/api/studio/builds/${buildId}/music`, { method: "POST" }).catch(() => null);
    const j = res ? ((await res.json().catch(() => null)) as { playlist?: Playlist; error?: string; notConfigured?: boolean } | null) : null;
    setBusy(false);
    if (!res?.ok || !j?.playlist) {
      if (isPlanError(j)) setPlanError(j); else if (j?.notConfigured) setNotReady(true); else setError(j?.error ?? "Couldn't make a playlist. Try again.");
      return;
    }
    setStatus({});
    onPlaylist(j.playlist);
    void makeMissing(j.playlist);
  };

  const use = async (trackId: string) => {
    setError(null);
    const res = await fetch(`/api/studio/builds/${buildId}/music/${trackId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ musicVolume: st?.musicVolume ?? 0.6, originalVolume: st?.originalVolume ?? 1 }) }).catch(() => null);
    const j = res ? ((await res.json().catch(() => null)) as { soundtrack?: Soundtrack; error?: string } | null) : null;
    if (!res?.ok || !j?.soundtrack) { setError(j?.error ?? "Couldn't add that track."); return; }
    onSoundtrack(j.soundtrack);
  };

  const remove = async () => {
    if (!st) return;
    const res = await fetch(`/api/studio/builds/${buildId}/music/${st.trackId}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { setError("Couldn't take the music out. Try again."); return; }
    onSoundtrack(null);
  };

  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); setCopied(s); setTimeout(() => setCopied(null), 1200); } catch { /* no clipboard */ } };

  return (
    <section className="cbm" aria-labelledby="cbm-h">
      <div className="cbm-head">
        <h4 id="cbm-h"><ListMusic size={14} /> Your playlist</h4>
        {playlist && canEdit && <button type="button" className="ov-btn ghost small" disabled={busy} onClick={() => void newPlaylist()}>{busy ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} New playlist</button>}
      </div>

      {notReady ? (
        <p className="cbm-muted">Music isn&apos;t switched on for SOCIA yet. It appears here once it is.</p>
      ) : planError ? (
        <PlanNotice error={planError} compact />
      ) : !playlist && autoAdding ? (
        <p className="cbm-muted"><Loader2 size={12} className="spin" /> SOCIA is picking music for this video from your taste and making the track (about a minute).</p>
      ) : !playlist ? (
        <>
          <p className="cbm-muted">SOCIA makes six original tracks for this video from your taste: how your best posts sound, whether music or your own sound has done better, and the tracks you picked before. They&apos;re made for you and cleared for business use, so they can go on any platform. Each one counts as a music track on your plan.</p>
          {canEdit && <button type="button" className="ov-btn primary small" disabled={busy} onClick={() => void newPlaylist()}>{busy ? <Loader2 size={12} className="spin" /> : <ListMusic size={12} />} {busy ? "Reading your taste…" : "Make my playlist"}</button>}
        </>
      ) : (
        <>
          {playlist.taste.length > 0 && <ul className="cbm-taste">{playlist.taste.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          <ol className="cbm-list">
            {playlist.tracks.map((t) => {
              const url = trackUrls[t.id];
              const s = status[t.id];
              const inUse = st?.trackId === t.id;
              return (
                <li key={t.id} className={inUse ? "on" : ""}>
                  <div className="cbm-track">
                    <b>{t.name}</b>
                    <small>{t.mood} {t.style} · {t.bpm} BPM · {t.energy} energy</small>
                    {t.why && <small className="cbm-why">{t.why}</small>}
                    {url ? <audio src={url} controls preload="none" aria-label={`Listen to ${t.name}`} /> : !s && autoMade ? (
                      canEdit ? <button type="button" className="ov-btn ghost small cbm-make" onClick={() => void make([t])}>Make it to listen</button> : <small className="cbm-muted">Not made yet</small>
                    ) : (
                      <small className={s?.state === "failed" ? "cbm-bad" : "cbm-muted"}>
                        {s?.state === "failed" ? <><AlertTriangle size={11} /> {s.error}</> : s?.state === "making" ? <><Loader2 size={11} className="spin" /> Making it (about a minute)…</> : "Waiting to be made"}
                      </small>
                    )}
                  </div>
                  {canEdit && url && (inUse
                    ? <span className="cb-badge built"><Check size={11} /> In the video</span>
                    : <button type="button" className="ov-btn ghost small" onClick={() => void use(t.id)}>Use this</button>)}
                </li>
              );
            })}
          </ol>

          {st && (
            <div className="cbm-mix">
              <b>Mix: {st.name}</b>
              <label><span>Music</span><input type="range" min={0} max={100} step={5} value={Math.round(st.musicVolume * 100)} disabled={!canEdit} onChange={(e) => onLevels(Number(e.target.value) / 100, st.originalVolume)} /><em>{Math.round(st.musicVolume * 100)}%</em></label>
              <label><span>Original sound</span><input type="range" min={0} max={100} step={5} value={Math.round(st.originalVolume * 100)} disabled={!canEdit} onChange={(e) => onLevels(st.musicVolume, Number(e.target.value) / 100)} /><em>{Math.round(st.originalVolume * 100)}%</em></label>
              {speechPct > 0 ? (
                <label className="st-check cbm-duck">
                  <input type="checkbox" checked={Boolean(st.duck)} disabled={!canEdit} onChange={(e) => onDuck(e.target.checked)} />
                  <span>Lower the music while someone is speaking <small>Speech fills {speechPct}% of this cut. The music drops to {Math.round(DUCK.under * 100)}% of its level under the words and comes back up in between.</small></span>
                </label>
              ) : <small className="cbm-duck-none">Nobody speaks in this cut, so the music stays at one level.</small>}
              {canEdit && <button type="button" className="ov-btn ghost small" onClick={() => void remove()}><X size={12} /> Take the music out</button>}
            </div>
          )}

          {playlist.suggestions.length > 0 && (
            <div className="cbm-sugg">
              <b>Or a song from the app&apos;s own library</b>
              <small>Instagram and TikTok add their licensed songs only inside their apps. Search for:</small>
              <ul>
                {playlist.suggestions.map((g) => (
                  <li key={g.search}>
                    <span><b>“{g.search}”</b>{g.why ? <small>{g.why}</small> : null}</span>
                    <button type="button" className="ov-btn ghost small" onClick={() => void copy(g.search)} aria-label={`Copy ${g.search}`}>{copied === g.search ? <Check size={12} /> : <Copy size={12} />}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {error && <p className="cbb-err" role="alert"><AlertTriangle size={12} /> {error}</p>}
    </section>
  );
}
