"use client";

// Add a voiceover, before the video is made (the Video editor's brief), the way a
// scriptwriter and a voice artist would work:
//   1. the voice: four that sound clearly different (energetic, calm and
//      cinematic, natural, bold), each with its own recorded sample, and More
//      voices for the rest;
//   2. what it should be about: a rough idea, a theme or talking points, or
//      "Write my own script" for someone who knows the words;
//   3. the script: SOCIA writes one (lib/voiceover/improve.ts), with every fact
//      looked up (the notes, the business facts SOCIA holds, the business's
//      website) and a question for anything still missing; editing it is free,
//      and one change at a time (shorter, a stronger hook...) can be asked for;
//   4. approve it;
//   5. the audio is made with the video, reading the approved words.
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Pause, PenLine, Play } from "lucide-react";
import { VOICE_NOTES_MAX } from "@/lib/studioClips/types";
import { secondsFromPrompt, VOICE_WPS, type VoiceChoice } from "@/lib/studioClips/voiceover";
import { actionCredits } from "@/lib/credits/config";

type Improved = { facts: { fact: string; from: string }[]; questions: string[]; readSite: string | null };
type Change = "shorter" | "engaging" | "hook" | "natural" | "cinematic" | "less_promo" | "again";

const CHANGES: [Exclude<Change, "again">, string][] = [
  ["shorter", "Make it shorter"], ["engaging", "More engaging"], ["hook", "Strengthen the hook"], ["natural", "More natural"],
  ["cinematic", "More cinematic"], ["less_promo", "Less promotional"],
];

const wordsIn = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
/** Seconds the script takes to say at an easy pace. */
const speakSec = (t: string) => Math.round(wordsIn(t) / VOICE_WPS);

function VoiceCard({ v, on, playing, disabled, onPick, onPlay }: { v: VoiceChoice; on: boolean; playing: boolean; disabled: boolean; onPick: () => void; onPlay: () => void }) {
  return (
    <div className={`cvo-voice${on ? " on" : ""}`}>
      <button type="button" role="radio" aria-checked={on} className="cvo-voice-pick" disabled={disabled} onClick={onPick}>
        <b>{v.name}</b>
        <small>{v.style ?? (v.description.split(",").slice(0, 2).join(",") || "Voice")}</small>
      </button>
      {v.preview && (
        <button type="button" className="sd-iconbtn" aria-label={playing ? `Stop ${v.name}` : `Play ${v.name}`} onClick={onPlay}>
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
      )}
    </div>
  );
}

export default function VoiceoverAsk({ notes, onNotes, voiceId, onVoice, approved, onApproved, onPending, prompt, disabled }: {
  /** what goes with the video: the script when there is one, else what it should be about */
  notes: string; onNotes: (v: string) => void;
  voiceId: string | null; onVoice: (id: string | null) => void;
  approved: boolean; onApproved: (v: boolean) => void;
  /** true while a script waits for the person's approval: the video waits too */
  onPending: (v: boolean) => void;
  prompt: string; disabled: boolean;
}) {
  const [featured, setFeatured] = useState<VoiceChoice[] | null>(null);
  const [all, setAll] = useState<VoiceChoice[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const [own, setOwn] = useState(false);
  const [theme, setTheme] = useState(notes);
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState<Change | "write" | null>(null);
  const [improved, setImproved] = useState<Improved | null>(null);
  const [answers, setAnswers] = useState("");
  const [error, setError] = useState<string | null>(null);
  const seconds = secondsFromPrompt(prompt);
  const cost = actionCredits("content_generation");

  useEffect(() => {
    let alive = true;
    fetch("/api/studio/voices").then((r) => r.json()).then((j: { voices?: VoiceChoice[]; notConfigured?: boolean; error?: string }) => {
      if (!alive) return;
      setFeatured(j.voices ?? []);
      if (!j.voices?.length) setVoiceNote(j.notConfigured ? "Voiceovers aren't set up on SOCIA yet." : j.error ?? "The voices couldn't be loaded. SOCIA picks one that suits the video.");
    }).catch(() => { if (alive) { setFeatured([]); setVoiceNote("The voices couldn't be loaded. SOCIA picks one that suits the video."); } });
    return () => { alive = false; audio.current?.pause(); };
  }, []);

  // What goes with the video: the script once there is one, else the theme for SOCIA to write from at the make.
  useEffect(() => { onNotes(script.trim() ? script : own ? "" : theme); }, [script, theme, own, onNotes]);
  // A script waits for approval before the video is made.
  useEffect(() => { onPending(Boolean(script.trim()) && !approved); }, [script, approved, onPending]);

  const play = (v: VoiceChoice) => {
    if (!v.preview) return;
    if (playing === v.id) { audio.current?.pause(); setPlaying(null); return; }
    audio.current?.pause();
    // The voice service's own recorded sample, played as is: nothing is made or counted.
    const el = new Audio(v.preview);
    el.onended = () => setPlaying(null);
    audio.current = el;
    void el.play().then(() => setPlaying(v.id)).catch(() => setPlaying(null));
  };
  const openAll = async () => {
    setShowAll((s) => !s);
    if (all) return;
    const j = (await fetch("/api/studio/voices?all=1").then((r) => r.json()).catch(() => null)) as { voices?: VoiceChoice[] } | null;
    setAll(j?.voices ?? []);
  };
  const chosen = [...(featured ?? []), ...(all ?? [])].find((v) => v.id === voiceId) ?? null;

  const run = async (change: Change | null) => {
    if (busy || !theme.trim()) return;
    setBusy(change ?? "write"); setError(null); onApproved(false);
    try {
      const res = await fetch("/api/studio/voiceover/improve", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: theme, prompt, seconds, answers: answers.trim() || null, voiceStyle: chosen?.style ?? null, ...(change ? { change, current: script } : {}) }),
      });
      const j = (await res.json().catch(() => null)) as ({ script?: string; error?: string } & Partial<Improved>) | null;
      if (!res.ok || !j?.script) { setError(j?.error ?? "SOCIA couldn't write the script just now. Try again."); return; }
      setScript(j.script);
      setImproved({ facts: j.facts ?? [], questions: j.questions ?? [], readSite: j.readSite ?? null });
      setAnswers("");
    } catch {
      setError("SOCIA couldn't be reached. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };
  const switchTo = (next: boolean) => {
    if (next === own) return;
    setOwn(next); setScript(""); setImproved(null); setError(null); onApproved(false);
  };

  const sec = speakSec(script);
  const long = sec > seconds + 2;
  return (
    <div className="cvo">
      <div role="radiogroup" aria-label="Voice">
        <span className="cvo-label">1. Voice</span>
        {featured == null ? <small className="cbp-muted"><Loader2 size={12} className="spin" /> Loading the voices…</small>
          : featured.length === 0 ? <small className="cbp-muted">{voiceNote}</small>
          : (
            <>
              <div className="cvo-voice-list">
                {featured.map((v) => <VoiceCard key={v.id} v={v} on={voiceId === v.id} playing={playing === v.id} disabled={disabled} onPick={() => onVoice(voiceId === v.id ? null : v.id)} onPlay={() => play(v)} />)}
              </div>
              <button type="button" className="ov-btn ghost small cvo-more" aria-expanded={showAll} onClick={() => void openAll()}><ChevronDown size={13} aria-hidden /> {showAll ? "Fewer voices" : "More voices"}</button>
              {showAll && (all == null ? <small className="cbp-muted"><Loader2 size={12} className="spin" /> Loading every voice…</small> : (
                <div className="cvo-voice-list cvo-voice-all">
                  {all.filter((v) => !featured.some((f) => f.id === v.id)).map((v) => <VoiceCard key={v.id} v={v} on={voiceId === v.id} playing={playing === v.id} disabled={disabled} onPick={() => onVoice(voiceId === v.id ? null : v.id)} onPlay={() => play(v)} />)}
                </div>
              ))}
              <small className="cbp-muted">{chosen ? `${chosen.name}${chosen.style ? `, ${chosen.style.toLowerCase()}` : ""}.` : "None chosen: SOCIA picks the one that suits the video."} Samples play the voice service&apos;s own recording and cost nothing.</small>
            </>
          )}
      </div>

      <div className="cvo-mode" role="radiogroup" aria-label="How the voiceover is written">
        <button type="button" role="radio" aria-checked={!own} className={`cbr-dir-chip${!own ? " on" : ""}`} disabled={disabled || Boolean(busy)} onClick={() => switchTo(false)}>SOCIA writes it</button>
        <button type="button" role="radio" aria-checked={own} className={`cbr-dir-chip${own ? " on" : ""}`} disabled={disabled || Boolean(busy)} onClick={() => switchTo(true)}>Write my own script</button>
      </div>

      {!own && (
        <>
          <label className="cba-cap">
            <span>2. What should your voiceover be about?</span>
            <textarea value={theme} rows={3} maxLength={VOICE_NOTES_MAX} disabled={disabled || Boolean(busy)}
              placeholder="Describe your idea, story, product, or message. SOCIA will turn it into an engaging voiceover script."
              onChange={(e) => setTheme(e.target.value)} />
          </label>
          <div className="cvo-row">
            <button type="button" className="ov-btn ghost small" disabled={disabled || Boolean(busy) || !theme.trim()} onClick={() => void run(script ? "again" : null)}>
              {busy === "write" || busy === "again" ? <Loader2 size={13} className="spin" /> : <PenLine size={13} />} {busy === "write" || busy === "again" ? "Writing, looking up your details…" : script ? "Write a new one" : "Write the script"}
            </button>
            <small className="cbp-muted">{cost} credits. One script for a {seconds}-second video{chosen?.style ? `, for a ${chosen.style.toLowerCase()} voice` : ""}. Facts come from what you wrote, your business details in SOCIA, then your website; SOCIA asks you for anything it can&apos;t find. Or leave it and SOCIA writes it when the video is made.</small>
          </div>
        </>
      )}

      {(own || script) && (
        <label className="cba-cap">
          <span>{own ? "2. Your script, word for word" : "3. The script: edit anything, it's free"}</span>
          <textarea value={script} rows={6} maxLength={VOICE_NOTES_MAX} disabled={disabled || Boolean(busy)}
            placeholder={own ? "The exact words the voice will read." : undefined}
            onChange={(e) => { setScript(e.target.value); if (approved) onApproved(false); }} />
          {script.trim() && (
            <small className={`cvo-time${long ? " is-long" : ""}`}>
              About {sec} seconds to say{long ? `, longer than the ${seconds}-second video: cut a line or two so it isn't rushed` : ` for a ${seconds}-second video`}.
            </small>
          )}
        </label>
      )}

      {!own && script && (
        <div className="cvo-changes" aria-label="Change one thing">
          {CHANGES.map(([c, label]) => (
            <button key={c} type="button" className="cbr-dir-chip" disabled={disabled || Boolean(busy)} onClick={() => void run(c)}>
              {busy === c && <Loader2 size={12} className="spin" />} {label}
            </button>
          ))}
          <small className="cbp-muted">Each one changes only that and uses {cost} credits.</small>
        </div>
      )}
      {error && <p className="cbb-err" role="alert">{error}</p>}

      {!own && improved && (improved.facts.length > 0 || improved.questions.length > 0 || improved.readSite) && (
        <div className="cvo-check">
          {improved.facts.length > 0 && (
            <div>
              <span className="cvo-label">Where the facts came from</span>
              <ul>{improved.facts.map((f) => <li key={`${f.fact}-${f.from}`}><b>{f.fact}</b>: {f.from}</li>)}</ul>
            </div>
          )}
          {improved.readSite && <small className="cbp-muted">SOCIA read {improved.readSite} for details your notes didn&apos;t have.</small>}
          {improved.questions.length > 0 && (
            <div>
              <span className="cvo-label">SOCIA needs from you</span>
              <ul>{improved.questions.map((q) => <li key={q}>{q}</li>)}</ul>
              <textarea className="cvo-answers" rows={2} maxLength={600} value={answers} disabled={disabled || Boolean(busy)} placeholder="Your answers, then Write a new one. Or approve the script as it is: what's missing stays out." onChange={(e) => setAnswers(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {script.trim() && (
        <label className="cbb-check cvo-approve">
          <input type="checkbox" checked={approved} disabled={disabled || Boolean(busy)} onChange={(e) => onApproved(e.target.checked)} />
          <span>{own ? "3" : "4"}. I&apos;ve read the script and it&apos;s right. Read these words in the video.</span>
        </label>
      )}
      {approved && <small className="cvo-ok"><Check size={12} aria-hidden /> Approved. The voice reads it word for word when the video is made. Changing the voice keeps the script.</small>}
    </div>
  );
}
