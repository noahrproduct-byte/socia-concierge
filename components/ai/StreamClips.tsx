"use client";

// AI Clipper → Live streams: paste up to four Twitch channels; SOCIA's watcher
// reads their chat and clips the moments it spikes (lib/streams/*). Everything
// shown is what the watcher really saw: live or not from Twitch, messages read,
// when it last checked in. Nothing here animates to look busy.
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Radio, Scissors, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { handFiles } from "@/lib/studioClips/handoff";
import { clipEditorBrief, clipFileName } from "@/lib/streams/editorBrief";
import { api, errorText } from "./shared";
import { MAX_WATCHED, channelFromInput } from "@/lib/streams/channels";
import type { StreamClip, StreamWatch, TwitchConnection } from "@/lib/streams/types";
import { hoursLeft, type StreamAllowance } from "@/lib/streams/limits";
import { ConfirmDialog } from "@/components/system";

type State = { configured: boolean; connection: TwitchConnection | null; watches: StreamWatch[]; clips: StreamClip[]; allowance: StreamAllowance; maxWatched: number };

const ago = (iso: string | null): string => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** The watcher checks in every 15 s; two minutes without it means it isn't running. */
const watcherDown = (w: StreamWatch) => w.status === "watching" && (!w.watcherSeenAt || Date.now() - new Date(w.watcherSeenAt).getTime() > 120_000);

const OUTCOME: Record<string, string> = {
  connected: "Twitch is connected.",
  denied: "Twitch wasn't connected: the request was declined.",
  error: "Twitch couldn't be connected. Try again.",
  forbidden: "Only the workspace owner or an Admin can connect Twitch.",
  notconfigured: "Twitch isn't set up on SOCIA yet.",
};

export default function StreamClips({ canMutate, canConnect, outcome }: { canMutate: boolean; canConnect: boolean; outcome: string | null }) {
  const [state, setState] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [inputs, setInputs] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<Record<string, string>>({});
  const router = useRouter();
  // The clip being fetched for the Video editor.
  const [opening, setOpening] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    try { setState(await api<State>("/api/streams")); setErr(null); }
    catch (e) { setErr(errorText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // While something is being watched, the list follows the watcher (it writes every 15 s).
  const watching = state?.watches.filter((w) => w.status === "watching") ?? [];
  useEffect(() => {
    if (!watching.length && !state?.clips.some((c) => c.status === "making")) return;
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [watching.length, state?.clips, load]);

  // What the plan allows (lib/plans.ts STREAM_LIMITS): channels at once and hours a month.
  const a = state?.allowance;
  const room = a ? Math.min(MAX_WATCHED, a.channels) : 0;
  const slots = room - watching.length;
  const hours = a ? hoursLeft(a) : null;
  const resets = a ? new Date(`${a.resetsOn}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
  const start = async () => {
    const channels = inputs.map((s) => s.trim()).filter(Boolean);
    const bad = channels.find((c) => !channelFromInput(c));
    if (bad) { setErr(`That isn't a Twitch channel: ${bad}. Paste a link like twitch.tv/name, or the name.`); return; }
    setBusy(true); setErr(null);
    try { await api("/api/streams", { method: "POST", body: JSON.stringify({ channels }) }); setInputs([""]); await load(); }
    catch (e) { setErr(errorText(e)); }
    finally { setBusy(false); }
  };
  const stop = async (id: string) => {
    try { await api(`/api/streams/watches/${id}`, { method: "DELETE" }); await load(); } catch (e) { setErr(errorText(e)); }
  };
  const removeClip = async (id: string) => {
    try { await api(`/api/streams/clips/${id}`, { method: "DELETE" }); await load(); } catch (e) { setErr(errorText(e)); }
  };
  const play = async (id: string) => {
    try { const { url } = await api<{ url: string }>(`/api/streams/clips/${id}`); setPlaying((p) => ({ ...p, [id]: url })); } catch (e) { setErr(errorText(e)); }
  };
  // Phase 2: a clip SOCIA saved (own or edited channel) goes to the Video editor with a brief for a vertical, captioned Reel.
  const toEditor = async (c: StreamClip) => {
    setOpening(c.id); setErr(null);
    try {
      const { url } = await api<{ url: string }>(`/api/streams/clips/${c.id}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Couldn't load the clip's video. Try again.");
      const blob = await res.blob();
      const file = new File([blob], clipFileName(c), { type: blob.type || "video/mp4" });
      handFiles("edit", [file], { prompt: clipEditorBrief(c) });
      router.push("/studio?mode=edit");
    } catch (e) {
      setErr(errorText(e));
      setOpening(null);
    }
  };
  const disconnect = async () => {
    setConfirmDisconnect(false);
    try { await api("/api/streams/twitch", { method: "DELETE" }); await load(); } catch (e) { setErr(errorText(e)); }
  };

  if (!state) {
    return <section className="ai-panel"><p className="ai-note" role="status">{err ?? <><Loader2 size={14} className="spin" aria-hidden /> Loading Live streams.</>}</p></section>;
  }

  return (
    <div className="ai-page">
      {outcome && OUTCOME[outcome] && <p className={outcome === "connected" ? "ai-note" : "ai-err"} role="status">{OUTCOME[outcome]}</p>}
      <section className="ai-panel">
        <div className="ai-panel-head"><Radio size={16} aria-hidden /><h2>Watch live streams</h2></div>
        <p className="ai-note">Paste live Twitch channels. SOCIA reads their chat and, when chat spikes, makes a Twitch clip that starts about 20 seconds before the reaction, scored 0 to 100 on how big the moment was for that channel.</p>
        {a && hours && (
          <p className="ai-note stc-plan">
            Your plan: {a.channels} {a.channels === 1 ? "stream" : "streams"} at a time, {a.hoursMonth} hours of live watching a month. {hours.usedHours} used, {hours.leftHours} left until {resets}. Only time a channel is live counts.
            {!a.keepVideo && " Clips stay on Twitch; from Growth, clips of your own or edited channels come into SOCIA as videos."}
          </p>
        )}
        {!state.configured ? (
          <p className="ai-empty">Twitch isn&apos;t set up on SOCIA yet, so Live streams can&apos;t start.</p>
        ) : !state.connection ? (
          <div className="st-connect">
            <p className="ai-empty">Connect Twitch first. SOCIA uses your account to read chat and make clips, the way you would by pressing Clip.</p>
            {canConnect ? <a className="btn-primary stc-connect" href="/api/auth/twitch/start">Connect Twitch</a> : <p className="ai-note">Ask the workspace owner or an Admin to connect Twitch.</p>}
          </div>
        ) : (
          <>
            <p className="ai-note stc-account">
              Connected to Twitch as <b>{state.connection.displayName ?? state.connection.login}</b>
              {canConnect && <button type="button" className="ai-act" onClick={() => setConfirmDisconnect(true)}>Disconnect</button>}
            </p>
            {canMutate && slots > 0 && !hours?.out && (
              <div className="stc-add">
                {inputs.map((v, i) => (
                  <label key={i} className="ai-field">
                    <span>{i === 0 ? "Twitch channel" : `Channel ${i + 1}`}</span>
                    <input type="text" value={v} placeholder="twitch.tv/name" onChange={(e) => setInputs((xs) => xs.map((x, k) => (k === i ? e.target.value : x)))} inputMode="url" autoComplete="off" />
                  </label>
                ))}
                <div className="ai-row">
                  {inputs.length < slots && <button type="button" className="ai-act" onClick={() => setInputs((xs) => [...xs, ""])}>Add another channel</button>}
                  <button type="button" className="btn-primary" disabled={busy || !inputs.some((s) => s.trim())} onClick={() => void start()}>{busy ? <Loader2 size={14} className="spin" aria-hidden /> : null} Start watching</button>
                </div>
              </div>
            )}
            {hours?.out && <p className="ai-note">This month&apos;s {a?.hoursMonth} hours are used. They come back on {resets}.{a && a.hoursMonth < 400 && <> <a href="/pricing">See plans with more hours</a>.</>}</p>}
            {!hours?.out && slots <= 0 && (
              <p className="ai-note">
                You&apos;re watching {room} {room === 1 ? "stream" : "streams"}, the most your plan allows at once. Stop one to add another.
                {room < MAX_WATCHED && <> <a href="/pricing?plan=pro">Watch up to {MAX_WATCHED} at once on Pro</a>.</>}
              </p>
            )}
          </>
        )}
        {err && <p className="ai-err" role="alert">{err}</p>}
      </section>

      {state.watches.length > 0 && (
        <section className="ai-panel">
          <div className="ai-panel-head"><h2>Channels</h2></div>
          <ul className="stc-watches">
            {state.watches.map((w) => (
              <li key={w.id} className={`stc-watch${w.status === "stopped" ? " is-stopped" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Twitch's own avatar URL */}
                {w.avatarUrl ? <img src={w.avatarUrl} alt="" width={36} height={36} /> : <span className="stc-ph" />}
                <div className="stc-watch-text">
                  <b>{w.name ?? w.login}</b>
                  <small>
                    {w.status === "stopped"
                      ? `Stopped ${w.stoppedAt ? when(w.stoppedAt) : ""}`
                      : watcherDown(w)
                        ? "Waiting for SOCIA's watcher to pick this up."
                        : `${w.live === null ? "Checking whether it's live" : w.live ? `Live${w.streamTitle ? `: ${w.streamTitle}` : ""}` : "Not live right now; SOCIA keeps checking"} · ${w.messagesSeen.toLocaleString()} chat messages read · last chat ${ago(w.lastChatAt)}`}
                  </small>
                  {w.keepVideo && w.canDownload === false && <small>Twitch only lets the streamer and their editors download clips, so these stay on Twitch.</small>}
                  {w.lastError && w.status === "watching" && <small className="ai-err">{w.lastError}</small>}
                  {w.lastError && w.status === "stopped" && <small>{w.lastError}</small>}
                </div>
                {w.status === "watching" && canMutate && <button type="button" className="ai-act" onClick={() => void stop(w.id)}><Square size={12} aria-hidden /> Stop</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.connection && (
        <section className="ai-panel">
          <div className="ai-panel-head"><h2>Clips</h2></div>
          {!state.clips.length ? (
            <p className="ai-empty">No clips yet. When chat on a watched channel spikes, the clip appears here.</p>
          ) : (
            <div className="ai-grid">
              {state.clips.map((c) => (
                <article key={c.id} className="ai-card">
                  {playing[c.id] ? (
                    <video src={playing[c.id]} controls autoPlay playsInline className="stc-media" />
                  ) : c.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Twitch's own thumbnail URL
                    <img src={c.thumbnailUrl} alt="" className="stc-media" />
                  ) : (
                    <div className="stc-media stc-making">{c.status === "making" ? <><Loader2 size={14} className="spin" aria-hidden /> Twitch is making the clip</> : c.status === "failed" ? c.error ?? "Twitch didn't make this clip." : null}</div>
                  )}
                  <div className="ai-card-body">
                    <b>{c.score != null ? `${c.score} / 100` : "Scoring"} · {c.login}</b>
                    {c.why && <small>{c.why}</small>}
                    <small>{when(c.spikeAt)}{c.duration ? ` · ${Math.round(c.duration)} s` : ""}</small>
                    {!c.hasVideo && c.status === "ready" && (() => {
                      const w = state.watches.find((x) => x.id === c.watchId);
                      const why = w && !w.keepVideo ? "Making Reels from clips in SOCIA starts on Growth, so this one stays on Twitch."
                        : w?.canDownload === false ? "Only the streamer and their editors can download Twitch clips, so this one stays on Twitch."
                        : null;
                      return why ? <small className="stc-stays">{why}</small> : null;
                    })()}
                    <div className="ai-row">
                      {c.hasVideo && c.status === "ready" && (
                        <button type="button" className="ai-act is-primary" onClick={() => void toEditor(c)} disabled={opening !== null} aria-busy={opening === c.id || undefined}>
                          {opening === c.id ? <><Loader2 size={12} className="spin" aria-hidden /> Opening</> : <><Scissors size={12} aria-hidden /> Make a Reel</>}
                        </button>
                      )}
                      {c.hasVideo && !playing[c.id] && <button type="button" className="ai-act" onClick={() => void play(c.id)}>Play</button>}
                      {c.url && <a className="ai-act" href={c.url} target="_blank" rel="noreferrer">Watch on Twitch <ExternalLink size={12} aria-hidden /></a>}
                      {c.editUrl && c.status === "ready" && <a className="ai-act" href={c.editUrl} target="_blank" rel="noreferrer">Edit on Twitch <ExternalLink size={12} aria-hidden /></a>}
                      {canMutate && <button type="button" className="ai-act" aria-label="Remove this clip from SOCIA" onClick={() => void removeClip(c.id)}><Trash2 size={12} aria-hidden /></button>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect Twitch?"
        body="SOCIA stops watching every channel and forgets your Twitch sign-in. Your clips stay on this list and on Twitch."
        confirmLabel="Disconnect"
        onConfirm={() => void disconnect()}
        onOpenChange={setConfirmDisconnect}
        danger
      />
    </div>
  );
}
