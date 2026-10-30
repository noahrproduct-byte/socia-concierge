"use client";

// Studio > Plan a post: stage 1, the concept (from a planned post, a Discover
// format, or an idea typed here), then stage 2, the production guide SOCIA
// writes for it: hooks, structure, script, shot list, filming and editing
// notes, caption and calls to action. Everything in the guide is editable;
// a planned post keeps its guide. Writing one counts one generation, so it
// starts on a click, never on its own.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ClipboardList, Copy, PenSquare, Pencil, RefreshCw, Video } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button, ConfirmDialog, Field, Input, Select, Textarea } from "@/components/system";
import { guideText, type GuideBeat, type GuideShot, type ProductionGuide, type StudioConcept } from "@/lib/studioGuide";
import "./guide.css";

type Source = { kind: "plan"; planId: string; index: number } | { kind: "format"; name: string } | null;

export default function GuideStudio({ modeTabs, concept: initialConcept, guide: initialGuide, source, missing }: { modeTabs: ReactNode; concept: StudioConcept | null; guide: ProductionGuide | null; source: Source; missing: boolean }) {
  const [concept, setConcept] = useState(initialConcept);
  const [guide, setGuide] = useState(initialGuide);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [idea, setIdea] = useState({ text: "", format: "Reel", platform: "Instagram" });

  const write = async (fromIdea: boolean) => {
    setBusy(true);
    setErr(null);
    setNote(null);
    setConfirm(false);
    try {
      const src = fromIdea ? { kind: "idea", ...idea } : source;
      const r = await fetch("/api/studio/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: src }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't write the guide just now.");
      setConcept(j.concept);
      setGuide(j.guide);
      if (j.saved) setNote("Saved to the planned post.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (g: ProductionGuide) => {
    setGuide(g);
    setEditing(false);
    if (source?.kind !== "plan") { setNote("Changed here. Copy the guide to keep it; only a planned post saves its guide."); return; }
    const r = await fetch("/api/studio/guide", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: source.planId, index: source.index, guide: g }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setNote(r?.ok ? "Saved to the planned post." : j?.error ?? "Changed here, but it couldn't be saved.");
  };

  return (
    <div className="gd">
      <PageHeader title="Content Studio" sub="Plan a post before you film: the concept, then hooks, script and shot list made for what you have." />
      {modeTabs}

      {!concept ? (
        <section className="gd-card gd-start">
          {missing && <p className="gd-note">That planned post or format isn&apos;t there anymore. Describe the idea instead.</p>}
          <h2>What do you want to make?</h2>
          <p className="gd-note">Or open a post from <Link href="/plan">Plan</Link>, or a format from <Link href="/discover">Discover</Link>, and SOCIA brings its reasoning with it.</p>
          <Field label="The idea"><Textarea rows={3} value={idea.text} onChange={(e) => setIdea({ ...idea, text: e.target.value })} maxLength={1200} placeholder="For example: our Friday special, from dough to the box, in one take" /></Field>
          <div className="gd-row2">
            <Field label="Format"><Select value={idea.format} onChange={(e) => setIdea({ ...idea, format: e.target.value })}>{["Reel", "Carousel", "Static", "Story"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
            <Field label="Platform"><Select value={idea.platform} onChange={(e) => setIdea({ ...idea, platform: e.target.value })}>{["Instagram", "Facebook", "YouTube", "TikTok"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          </div>
          {err && <p className="s-error" role="alert">{err}</p>}
          <div><Button variant="primary" busy={busy} disabled={idea.text.trim().length < 10} onClick={() => write(true)}><ClipboardList size={14} aria-hidden /> Write the production guide</Button></div>
          <p className="gd-note">Uses one content generation from your plan.</p>
        </section>
      ) : (
        <>
          <ConceptCard c={concept} />
          {!guide ? (
            <section className="gd-card">
              <h2>Production guide</h2>
              <p className="gd-note">Hooks, a script, a shot list, filming and editing notes, a caption and calls to action, made for your brand and the equipment and time you said you have. Uses one content generation from your plan.</p>
              {err && <p className="s-error" role="alert">{err}</p>}
              <div><Button variant="primary" busy={busy} onClick={() => write(source == null)}><ClipboardList size={14} aria-hidden /> Write the production guide</Button></div>
            </section>
          ) : editing ? (
            <GuideEditor g={guide} onCancel={() => setEditing(false)} onSave={save} />
          ) : (
            <GuideView c={concept} g={guide} note={note} err={err} busy={busy} canSave={source?.kind === "plan"} onEdit={() => setEditing(true)} onRewrite={() => setConfirm(true)} />
          )}
        </>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Write a new guide?"
        body={`SOCIA writes a new production guide for this concept${guide?.edited_at ? " and your edits are replaced" : ""}. Uses one content generation.`}
        confirmLabel="Write a new guide"
        onConfirm={() => write(source == null && concept?.source === "idea")}
        busy={busy}
      />
    </div>
  );
}

function ConceptCard({ c }: { c: StudioConcept }) {
  const from = c.source === "plan" ? `From your plan${c.day ? `, ${c.day}` : ""}` : c.source === "format" ? "Adapted from a format in your niche" : "Your idea";
  return (
    <section className="gd-card">
      <div className="gd-tags">
        <span className="gd-tag">{from}</span>
        <span className="gd-tag">{c.format}</span>
        {c.platform && <span className="gd-tag">{c.platform}</span>}
      </div>
      <h2>{c.title}</h2>
      <p>{c.concept}</p>
      <dl className="gd-facts">
        {c.reasoning && <div><dt>Why this</dt><dd>{c.reasoning}</dd></div>}
        {c.audience && <div><dt>For</dt><dd>{c.audience}</dd></div>}
        {c.goal && <div><dt>Goal</dt><dd>{c.goal}</dd></div>}
        {c.successMetric && <div><dt>Success measure</dt><dd>{c.successMetric}</dd></div>}
      </dl>
      {c.research.length > 0 && (
        <div className="gd-research">
          <h3>Supporting research</h3>
          <ul>{c.research.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

function GuideView({ c, g, note, err, busy, canSave, onEdit, onRewrite }: { c: StudioConcept; g: ProductionGuide; note: string | null; err: string | null; busy: boolean; canSave: boolean; onEdit: () => void; onRewrite: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = guideText(c, g);
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt("Copy the guide", text); }
  };
  const create = new URLSearchParams({ caption: `${g.hooks[0]?.text ?? ""}\n\n${g.caption}`.trim(), from: "studio", ...(c.planId ? { planId: c.planId } : {}), ...(c.day ? { planDay: c.day } : {}) });
  return (
    <section className="gd-card">
      <div className="gd-bar">
        <h2>Production guide{g.length_sec ? <small> about {g.length_sec} s</small> : null}</h2>
        <div className="gd-actions">
          <Button size="sm" onClick={onEdit}><Pencil size={13} aria-hidden /> Edit</Button>
          <Button size="sm" onClick={copy}>{copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {copied ? "Copied" : "Copy guide"}</Button>
          <Button size="sm" variant="ghost" busy={busy} onClick={onRewrite}><RefreshCw size={13} aria-hidden /> Write a new one</Button>
        </div>
      </div>
      {note && <p className="gd-note" role="status">{note}</p>}
      {err && <p className="s-error" role="alert">{err}</p>}

      <div className="gd-grid">
        <div className="gd-sec">
          <h3>Openings to try</h3>
          <ul>{g.hooks.map((h) => <li key={h.text}>{h.text}{h.style ? <small> {h.style}</small> : null}</li>)}</ul>
        </div>
        {g.structure.length > 0 && (
          <div className="gd-sec">
            <h3>Structure</h3>
            <ol>{g.structure.map((s) => <li key={s}>{s}</li>)}</ol>
          </div>
        )}
      </div>

      <div className="gd-sec">
        <h3>Script</h3>
        <ol className="gd-script">{g.script.map((b, i) => <li key={i}><b>{b.beat}{b.seconds ? <small> {b.seconds} s</small> : null}</b><span>{b.line}</span></li>)}</ol>
      </div>
      <div className="gd-sec">
        <h3>Shot list</h3>
        <ol className="gd-shots">{g.shots.map((s, i) => <li key={i}><b>{s.shot}</b><span>{[s.framing, s.seconds ? `${s.seconds} s` : null].filter(Boolean).join(", ")}{s.notes ? `. ${s.notes}` : ""}</span></li>)}</ol>
      </div>
      <div className="gd-grid">
        {g.filming.length > 0 && <div className="gd-sec"><h3>Filming</h3><ul>{g.filming.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        {g.editing.length > 0 && <div className="gd-sec"><h3>Editing</h3><ul>{g.editing.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      </div>
      <div className="gd-grid">
        {g.caption && <div className="gd-sec"><h3>Caption</h3><p className="gd-caption">{g.caption}</p></div>}
        {g.ctas.length > 0 && <div className="gd-sec"><h3>Calls to action</h3><ul>{g.ctas.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      </div>

      <div className="gd-next">
        <Link href={`/create?${create.toString()}`} className="ov-link"><PenSquare size={13} aria-hidden /> Create this post</Link>
        <Link href="/studio" className="ov-link"><Video size={13} aria-hidden /> Review your draft once it&apos;s filmed</Link>
        {!canSave && <span className="gd-note">Only a planned post keeps its guide; copy it to keep this one.</span>}
      </div>
    </section>
  );
}

function GuideEditor({ g, onCancel, onSave }: { g: ProductionGuide; onCancel: () => void; onSave: (g: ProductionGuide) => void }) {
  const [d, setD] = useState(g);
  const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))) || null);
  const setBeat = (i: number, p: Partial<GuideBeat>) => setD((x) => ({ ...x, script: x.script.map((b, j) => (j === i ? { ...b, ...p } : b)) }));
  const setShot = (i: number, p: Partial<GuideShot>) => setD((x) => ({ ...x, shots: x.shots.map((s, j) => (j === i ? { ...s, ...p } : s)) }));
  return (
    <form className="gd-card gd-edit" onSubmit={(e) => { e.preventDefault(); onSave(d); }}>
      <h2>Edit the guide</h2>
      <Field label="Openings to try" hint="One per line."><Textarea rows={3} defaultValue={d.hooks.map((h) => h.text).join("\n")} onChange={(e) => setD({ ...d, hooks: lines(e.target.value).map((text, i) => ({ text, style: d.hooks[i]?.style ?? "" })) })} /></Field>
      <Field label="Structure" hint="Beats in order, one per line."><Textarea rows={3} defaultValue={d.structure.join("\n")} onChange={(e) => setD({ ...d, structure: lines(e.target.value) })} /></Field>
      <fieldset className="gd-set">
        <legend>Script</legend>
        {d.script.map((b, i) => (
          <div className="gd-rowx" key={i}>
            <Input aria-label={`Beat ${i + 1}`} value={b.beat} onChange={(e) => setBeat(i, { beat: e.target.value })} maxLength={40} />
            <Input aria-label={`Beat ${i + 1} line`} value={b.line} onChange={(e) => setBeat(i, { line: e.target.value })} maxLength={400} />
            <Input aria-label={`Beat ${i + 1} seconds`} type="number" min={0} value={b.seconds ?? ""} onChange={(e) => setBeat(i, { seconds: num(e.target.value) })} />
          </div>
        ))}
      </fieldset>
      <fieldset className="gd-set">
        <legend>Shot list</legend>
        {d.shots.map((s, i) => (
          <div className="gd-rowx gd-rowx4" key={i}>
            <Input aria-label={`Shot ${i + 1}`} value={s.shot} onChange={(e) => setShot(i, { shot: e.target.value })} maxLength={160} />
            <Input aria-label={`Shot ${i + 1} framing`} value={s.framing} onChange={(e) => setShot(i, { framing: e.target.value })} maxLength={80} />
            <Input aria-label={`Shot ${i + 1} seconds`} type="number" min={0} value={s.seconds ?? ""} onChange={(e) => setShot(i, { seconds: num(e.target.value) })} />
            <Input aria-label={`Shot ${i + 1} note`} value={s.notes} onChange={(e) => setShot(i, { notes: e.target.value })} maxLength={200} />
          </div>
        ))}
      </fieldset>
      <Field label="Filming" hint="One per line."><Textarea rows={3} defaultValue={d.filming.join("\n")} onChange={(e) => setD({ ...d, filming: lines(e.target.value) })} /></Field>
      <Field label="Editing" hint="One per line."><Textarea rows={3} defaultValue={d.editing.join("\n")} onChange={(e) => setD({ ...d, editing: lines(e.target.value) })} /></Field>
      <Field label="Caption"><Textarea rows={4} value={d.caption} onChange={(e) => setD({ ...d, caption: e.target.value })} maxLength={2200} /></Field>
      <Field label="Calls to action" hint="One per line."><Textarea rows={2} defaultValue={d.ctas.join("\n")} onChange={(e) => setD({ ...d, ctas: lines(e.target.value) })} /></Field>
      <div className="gd-actions">
        <Button type="submit" variant="primary">Save guide</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
