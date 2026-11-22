"use client";

// Animate a video (Content Studio): the person says what the video is about,
// typed or spoken, can have SOCIA improve the wording, and can add a video to
// copy. "Animate it" opens the same check-and-edit dialog a planned animated
// post uses (components/animated/MakeWithAi.tsx), which renders the video in
// this browser and saves it as a draft. Nothing posts from here.
import { useEffect, useRef, useState } from "react";
import { Film, PenLine, Upload, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/system";
import MakeWithAi from "@/components/animated/MakeWithAi";
import MicButton from "./MicButton";
import { useSpeech } from "./useSpeech";
import { readReferenceFile } from "./readReferenceFile";
import { PROMPT_MAX, type ReferenceInput } from "@/lib/studioClips/reference";

const KEY = "socia.animate.prompt";
const STARTERS = [
  "Compare two things side by side",
  "Count up to one big number",
  "Three steps, one at a time",
  "A myth, then the truth",
];

export default function AnimateStudio({ viewerId, modeTabs }: { viewerId: string; modeTabs: React.ReactNode }) {
  const [prompt, setPrompt] = useState("");
  // What was typed stays through a refresh or a trip to another page.
  useEffect(() => { try { const v = sessionStorage.getItem(KEY); if (v) setPrompt(v); } catch { /* storage may be off */ } }, []);
  useEffect(() => { try { sessionStorage.setItem(KEY, prompt); } catch { /* storage may be off */ } }, [prompt]);
  const speech = useSpeech((text) => setPrompt((p) => `${p}${p && !/\s$/.test(p) ? " " : ""}${text}`.slice(0, PROMPT_MAX)));

  const [improving, setImproving] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const before = useRef<string | null>(null);
  async function improve() {
    if (!prompt.trim()) { setNote({ text: "Write or say a few words about the video first.", error: true }); return; }
    setImproving(true); setNote(null);
    try {
      const res = await fetch("/api/animated/improve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: prompt.trim(), hasReference: Boolean(reference) }) });
      const j = (await res.json().catch(() => null)) as { prompt?: string; error?: string } | null;
      if (!res.ok || !j?.prompt) { setNote({ text: j?.error ?? "SOCIA couldn't improve that just now. Your words are unchanged.", error: true }); return; }
      before.current = prompt;
      setPrompt(j.prompt);
      setNote({ text: "Improved. Read it, change anything, or put yours back." });
    } catch {
      setNote({ text: "SOCIA couldn't improve that just now. Check your connection.", error: true });
    } finally { setImproving(false); }
  }

  const [reference, setReference] = useState<ReferenceInput | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [refNote, setRefNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function addReference(file: File) {
    setReference(null); setRefNote(null);
    const r = await readReferenceFile(file, viewerId, setReading);
    setReading(null);
    if (!r.ok) { setRefNote({ text: r.message, error: true }); return; }
    setReference(r.reference);
    setRefNote(r.note ? { text: r.note } : null);
  }

  const [making, setMaking] = useState(0);
  const ready = prompt.trim().length >= 8 && !reading;

  return (
    <>
      <PageHeader title="Animate a video" sub="Say what it is about. SOCIA writes it and animates it. You check every line before it is saved." />
      {modeTabs}
      <div className="stu-anim">
        <section className="stu-card" aria-labelledby="stu-what">
          <h2 id="stu-what">What is the video about?</h2>
          <div className="stu-prompt">
            <textarea
              aria-labelledby="stu-what"
              value={prompt}
              maxLength={PROMPT_MAX}
              placeholder="Make a video like the one I added, but for my barbershop: three reasons to book online, ending with the link in my bio."
              onChange={(e) => setPrompt(e.target.value)}
            />
            <MicButton supported={speech.supported} listening={speech.listening} onToggle={speech.toggle} size="large" labelIdle="Say what the video is about" />
          </div>
          <div className="stu-chips" aria-label="Ways to start">
            {STARTERS.map((s) => <button key={s} type="button" onClick={() => setPrompt((p) => (p.trim() ? `${p.trim()} ${s}.` : `${s}: `))}>{s}</button>)}
          </div>
          {(note || speech.error) && <p className={`stu-note${note?.error || speech.error ? " is-error" : ""}`} role="status">{speech.error ?? note?.text}</p>}
          <div className="stu-row">
            <Button onClick={() => void improve()} busy={improving} disabled={improving}><PenLine size={14} aria-hidden /> Improve my prompt</Button>
            {before.current != null && before.current !== prompt && <Button variant="ghost" onClick={() => { setPrompt(before.current ?? ""); before.current = null; setNote(null); }}>Put mine back</Button>}
            <span className="stu-row-end">
              <Button variant="primary" disabled={!ready} onClick={() => setMaking((n) => n + 1)} title={ready ? "SOCIA writes the video, then you check it. Counts as one animated video." : "Write a few words about the video first."}><Film size={15} aria-hidden /> Animate it</Button>
            </span>
          </div>
        </section>

        <section className="stu-card" aria-labelledby="stu-ref">
          <h2 id="stu-ref">A video to copy (optional)</h2>
          {reference ? (
            <div className="stu-ref">
              {reference.frames[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:image/jpeg;base64,${reference.frames[0].jpeg}`} alt="" />
              )}
              <span><b>{reference.name}</b><small className="stu-note">{Math.round(reference.durationSec)} seconds{reference.cuts ? `, ${reference.cuts.length + 1} shots` : ""}</small></span>
              <Button variant="ghost" size="sm" onClick={() => { setReference(null); setRefNote(null); }}><X size={14} aria-hidden /> Remove</Button>
            </div>
          ) : (
            <button
              type="button"
              className={`stu-drop${over ? " is-over" : ""}`}
              disabled={Boolean(reading)}
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !reading) void addReference(f); }}
            >
              <Upload aria-hidden />
              <span>{reading ?? "Drop a video here, or choose one"}</span>
              <small>SOCIA copies its structure, pace and text style, with your subject. Up to 3 minutes.</small>
            </button>
          )}
          <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm,video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addReference(f); e.target.value = ""; }} />
          {refNote && <p className={`stu-note${refNote.error ? " is-error" : ""}`} role="status">{refNote.text}</p>}
          <p className="stu-note">The video stays on this device. SOCIA reads its length, cuts, a few frames and what is said.</p>
        </section>
      </div>
      {making > 0 && (
        <MakeWithAi key={making} open onOpenChange={(o) => { if (!o) setMaking(0); }} source={{ kind: "prompt", prompt: prompt.trim(), reference, label: "Animate a video" }} />
      )}
    </>
  );
}
