"use client";

// Add a voiceover, before the video is made (the Video editor's brief):
//   - the voice: a few voices, each with its own sample to play, one chosen;
//   - what it should say: the person's notes, and Auto improve, which turns
//     them into the script to be read, with every fact looked up (the notes,
//     the business facts SOCIA holds, then the business's website) and a
//     question for anything still missing (lib/voiceover/improve.ts);
//   - approval: an improved script is read and approved before the video is
//     made, and is then read word for word.
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pause, PenLine, Play } from "lucide-react";
import { VOICE_NOTES_MAX } from "@/lib/studioClips/types";
import { secondsFromPrompt, type VoiceChoice } from "@/lib/studioClips/voiceover";

type Improved = { facts: { fact: string; from: string }[]; questions: string[]; readSite: string | null };

export default function VoiceoverAsk({ notes, onNotes, voiceId, onVoice, approved, onApproved, onPending, prompt, disabled }: {
  notes: string; onNotes: (v: string) => void;
  voiceId: string | null; onVoice: (id: string | null) => void;
  approved: boolean; onApproved: (v: boolean) => void;
  /** true while an improved script is waiting for the person's approval: the video waits too */
  onPending: (v: boolean) => void;
  prompt: string; disabled: boolean;
}) {
  const [voices, setVoices] = useState<VoiceChoice[] | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [improving, setImproving] = useState(false);
  const [improved, setImproved] = useState<Improved | null>(null);
  const [answers, setAnswers] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/studio/voices").then((r) => r.json()).then((j: { voices?: VoiceChoice[]; notConfigured?: boolean; error?: string }) => {
      if (!alive) return;
      setVoices(j.voices ?? []);
      if (!j.voices?.length) setVoiceNote(j.notConfigured ? "Voiceovers aren't set up on SOCIA yet." : j.error ?? "The voices couldn't be loaded. SOCIA picks one that suits the video.");
    }).catch(() => { if (alive) { setVoices([]); setVoiceNote("The voices couldn't be loaded. SOCIA picks one that suits the video."); } });
    return () => { alive = false; audio.current?.pause(); };
  }, []);

  // An improved script waits for approval; changing a word takes the approval back.
  useEffect(() => { onPending(Boolean(improved) && !approved); }, [improved, approved, onPending]);

  const play = (v: VoiceChoice) => {
    if (!v.preview) return;
    if (playing === v.id) { audio.current?.pause(); setPlaying(null); return; }
    audio.current?.pause();
    const el = new Audio(v.preview);
    el.onended = () => setPlaying(null);
    audio.current = el;
    void el.play().then(() => setPlaying(v.id)).catch(() => setPlaying(null));
  };

  const improve = async () => {
    if (!notes.trim() || improving) return;
    setImproving(true); setError(null); onApproved(false);
    try {
      const res = await fetch("/api/studio/voiceover/improve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes, prompt, seconds: secondsFromPrompt(prompt), answers: answers.trim() || null }) });
      const j = (await res.json().catch(() => null)) as ({ script?: string; error?: string } & Partial<Improved>) | null;
      if (!res.ok || !j?.script) { setError(j?.error ?? "SOCIA couldn't improve the voiceover just now. Try again."); return; }
      onNotes(j.script);
      setImproved({ facts: j.facts ?? [], questions: j.questions ?? [], readSite: j.readSite ?? null });
      setAnswers("");
    } catch {
      setError("SOCIA couldn't be reached. Check your connection and try again.");
    } finally {
      setImproving(false);
    }
  };

  return (
    <div className="cvo">
      <div className="cvo-voices" role="radiogroup" aria-label="Voice">
        <span className="cvo-label">Voice</span>
        {voices == null ? <small className="cbp-muted"><Loader2 size={12} className="spin" /> Loading the voices…</small>
          : voices.length === 0 ? <small className="cbp-muted">{voiceNote}</small>
          : (
            <div className="cvo-voice-list">
              {voices.map((v) => {
                const on = voiceId === v.id;
                return (
                  <div key={v.id} className={`cvo-voice${on ? " on" : ""}`}>
                    <button type="button" role="radio" aria-checked={on} className="cvo-voice-pick" disabled={disabled} onClick={() => onVoice(on ? null : v.id)}>
                      <b>{v.name}</b>
                      {v.description && <small>{v.description.split(",").slice(0, 3).join(",")}</small>}
                    </button>
                    {v.preview && (
                      <button type="button" className="sd-iconbtn" aria-label={playing === v.id ? `Stop ${v.name}` : `Play ${v.name}`} onClick={() => play(v)}>
                        {playing === v.id ? <Pause size={13} /> : <Play size={13} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        {voices && voices.length > 0 && !voiceId && <small className="cbp-muted">None chosen: SOCIA picks the one that suits the video.</small>}
      </div>

      <label className="cba-cap">
        <span>What should the voiceover say? (optional)</span>
        <textarea value={notes} rows={approved || improved ? 5 : 3} maxLength={VOICE_NOTES_MAX} disabled={disabled || improving}
          placeholder="Details about your business, the offer, the story or the tone. For example: family run since 1998, dough stretched by hand every morning, open till 10 on Fridays."
          onChange={(e) => { onNotes(e.target.value); if (approved) onApproved(false); }} />
      </label>
      <div className="cvo-row">
        <button type="button" className="ov-btn ghost small" disabled={disabled || improving || !notes.trim()} onClick={() => void improve()}>
          {improving ? <Loader2 size={13} className="spin" /> : <PenLine size={13} />} {improving ? "Looking up your details…" : improved ? "Improve again" : "Auto improve"}
        </button>
        <small className="cbp-muted">Writes the script from your notes. Facts come from your notes, your business details in SOCIA, then your website; SOCIA asks you for anything it can&apos;t find. Counts one hook and caption generation on your plan.</small>
      </div>
      {error && <p className="cbb-err" role="alert">{error}</p>}

      {improved && (
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
              <textarea className="cvo-answers" rows={2} maxLength={600} value={answers} disabled={disabled || improving} placeholder="Your answers, then Improve again. Or approve the script as it is: what's missing stays out." onChange={(e) => setAnswers(e.target.value)} />
            </div>
          )}
          <label className="cbb-check cvo-approve">
            <input type="checkbox" checked={approved} disabled={disabled || improving || !notes.trim()} onChange={(e) => onApproved(e.target.checked)} />
            <span>I&apos;ve read the script and it&apos;s right. Read these words in the video.</span>
          </label>
          {approved && <small className="cvo-ok"><Check size={12} aria-hidden /> Approved. The voiceover reads it word for word.</small>}
        </div>
      )}
    </div>
  );
}
