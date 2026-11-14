"use client";

// Settings: the account's video style (lib/videoStyle.ts), read from its own
// Reels and its competitors', for the person to check and correct. Animated
// videos are drawn from what is saved here.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/system";
import { FONTS, FONT_LABEL, LOGO_SPOTS, type VideoStyle } from "@/lib/videoStyle";

const SPOT_LABEL: Record<string, string> = {
  "top-left": "Top left", "top-right": "Top right", "top-center": "Top centre", "bottom-left": "Bottom left",
  "bottom-right": "Bottom right", "bottom-center": "Bottom centre", center: "Centre", none: "No logo",
};

function Thumb({ src, href, label }: { src: string | null; href: string | null; label: string }) {
  const [broken, setBroken] = useState(false);
  const img = src && !broken
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" width={54} height={96} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setBroken(true); }} />
    : <span aria-hidden />;
  return href ? <a className="vs-thumb" href={href} target="_blank" rel="noreferrer" aria-label={label}>{img}</a> : <span className="vs-thumb">{img}</span>;
}

export default function VideoStyleCard({ initial, canEdit, connected }: { initial: VideoStyle | null; canEdit: boolean; connected: boolean }) {
  const [style, setStyle] = useState<VideoStyle | null>(initial);
  const [draft, setDraft] = useState<VideoStyle | null>(initial);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = JSON.stringify(draft?.identity) !== JSON.stringify(style?.identity);

  async function read(fresh: boolean) {
    setBusy("read"); setMsg(null);
    try {
      const r = await fetch("/api/video-style", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fresh }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.style) { setMsg(j?.error || "SOCIA couldn't read your Reels just now. Try again in a minute."); return; }
      setStyle(j.style); setDraft(j.style);
      setMsg("Read. Check it, then save it.");
    } catch {
      setMsg("SOCIA couldn't read your Reels just now. Try again in a minute.");
    } finally { setBusy(null); }
  }

  async function save() {
    if (!draft) return;
    setBusy("save"); setMsg(null);
    try {
      const r = await fetch("/api/video-style", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: draft.identity }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.style) { setMsg(j?.error || "Couldn't save. Try again."); return; }
      setStyle(j.style); setDraft(j.style);
      setMsg("Saved. Animated videos are drawn in this style now.");
    } catch {
      setMsg("Couldn't save. Try again.");
    } finally { setBusy(null); }
  }

  if (busy === "read") {
    return <p className="br-reading" role="status"><Loader2 size={16} className="spin" aria-hidden /> Watching your Reels and your competitors&apos;, measuring their colours and cuts. This takes one to three minutes.</p>;
  }
  if (!style || !draft) {
    return (
      <div className="br-card">
        <p className="br-note">SOCIA hasn&apos;t read your video style yet. It watches your best Reels for your colours, type, logo and characters, and your competitors&apos; for how they hook and pace, so your animated videos look like yours.</p>
        {msg && <p className="br-note" role="status">{msg}</p>}
        {canEdit && connected && <div className="br-actions"><Button variant="primary" size="sm" onClick={() => read(true)}>Read my video style</Button></div>}
        {!connected && <p className="br-note">Connect Instagram first.</p>}
      </div>
    );
  }

  const id = draft.identity;
  const set = (patch: Partial<VideoStyle["identity"]>) => setDraft({ ...draft, identity: { ...id, ...patch } });
  const own = style.sources.filter((s) => s.from === "own");
  const comp = style.sources.filter((s) => s.from === "competitor");
  const m = style.measured;

  return (
    <div className="br-card vs">
      {!style.confirmed_at && <p className="br-banner">SOCIA read this from your Reels. Check it and save it, so your animated videos look like yours.</p>}
      <p className="br-note">
        Read from {own.length} of your Reels{comp.length ? ` and ${comp.length} of your competitors'` : ""} on {new Date(style.read_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
        {m.own.seconds != null && ` Yours run about ${Math.round(m.own.seconds)} seconds${m.own.cutsPer10s != null ? ` with ${m.own.cutsPer10s} cuts every 10 seconds` : ""}.`}
        {m.competitors.seconds != null && ` Theirs run about ${Math.round(m.competitors.seconds)} seconds${m.competitors.cutsPer10s != null ? ` with ${m.competitors.cutsPer10s} cuts every 10 seconds` : ""}.`}
      </p>
      <div className="vs-thumbs" aria-label="Your Reels SOCIA read">
        {own.map((s) => <Thumb key={s.id} src={s.thumb} href={s.permalink} label={`Open your Reel${s.multiple != null ? `, ${s.multiple}x your usual views` : ""}`} />)}
      </div>

      <div className="br-block">
        <span className="s-label">Colours</span>
        <div className="vs-colors">
          {(["background", "text", "accent"] as const).map((k) => (
            <label key={k} className="vs-color">
              <input type="color" value={id[k]} disabled={!canEdit} onChange={(e) => set({ [k]: e.target.value.toUpperCase() })} />
              <span>{k === "background" ? "Background" : k === "text" ? "Text" : "Accent"}<small>{id[k]}</small></span>
            </label>
          ))}
        </div>
        <div className="vs-palette" aria-label="Colours measured from your Reels">
          {m.own.palette.map((s) => <span key={s.hex} style={{ background: s.hex, flexGrow: Math.max(s.share, 0.04) }} title={`${s.hex}, ${Math.round(s.share * 100)}% of your frames`} />)}
        </div>
        <small className="br-note">Measured from the pixels of your Reels.</small>
      </div>

      <div className="vs-row">
        <Field label="Type">
          <select className="s-input" value={id.font} disabled={!canEdit} onChange={(e) => set({ font: e.target.value as VideoStyle["identity"]["font"] })}>
            {FONTS.map((f) => <option key={f} value={f}>{FONT_LABEL[f]}</option>)}
          </select>
        </Field>
        <Field label="Logo">
          <select className="s-input" value={id.logo.spot} disabled={!canEdit} onChange={(e) => set({ logo: { ...id.logo, spot: e.target.value as VideoStyle["identity"]["logo"]["spot"] } })}>
            {LOGO_SPOTS.map((s) => <option key={s} value={s}>{SPOT_LABEL[s]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="How your words look"><Textarea rows={2} maxLength={300} value={id.type} disabled={!canEdit} onChange={(e) => set({ type: e.target.value })} /></Field>
      <Field label="Characters" optional><Textarea rows={2} maxLength={300} value={id.characters} disabled={!canEdit} placeholder="None" onChange={(e) => set({ characters: e.target.value })} /></Field>
      <Field label="The stage" optional hint="The fixed frame your videos are built on."><Textarea rows={2} maxLength={300} value={id.stage} disabled={!canEdit} placeholder="None" onChange={(e) => set({ stage: e.target.value })} /></Field>

      {id.formats.length > 0 && (
        <div className="br-block">
          <span className="s-label">Your kinds of video</span>
          <ul className="br-formats">
            {id.formats.map((f, i) => {
              const ex = style.sources.find((s) => f.ids.includes(s.id));
              return (
                <li key={i}>
                  <Thumb src={ex?.thumb ?? null} href={ex?.permalink ?? null} label={`Open an example of ${f.name}`} />
                  <div className="br-format-body">
                    <Input aria-label="Name" maxLength={40} value={f.name} disabled={!canEdit} onChange={(e) => set({ formats: id.formats.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                    <Textarea aria-label="What it looks like" rows={2} maxLength={360} value={f.look} disabled={!canEdit} onChange={(e) => set({ formats: id.formats.map((x, k) => (k === i ? { ...x, look: e.target.value } : x)) })} />
                    <small className="br-stats">{f.ids.length} of your Reels{f.spine ? `. Carried by ${f.spine.charAt(0).toLowerCase()}${f.spine.slice(1)}` : ""}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(style.structure.hooks.length > 0 || style.structure.pacing) && (
        <div className="br-block">
          <span className="s-label">From your competitors: how they build theirs</span>
          <ul className="vs-structure">
            {style.structure.hooks.map((h, i) => <li key={`h${i}`}><b>Hook</b> {h}</li>)}
            {style.structure.pacing && <li><b>Pacing</b> {style.structure.pacing}</li>}
            {style.structure.spines.map((h, i) => <li key={`s${i}`}><b>Carried by</b> {h}</li>)}
            {style.structure.endings.map((h, i) => <li key={`e${i}`}><b>Ending</b> {h}</li>)}
          </ul>
          <small className="br-note">Only how they&apos;re built. SOCIA never copies a competitor&apos;s look, characters or words.</small>
        </div>
      )}

      {style.limitations.length > 0 && <p className="br-note">{style.limitations.join(" ")}</p>}
      {msg && <p className="br-note" role="status">{msg}</p>}
      {canEdit && (
        <div className="br-actions">
          <Button variant="primary" size="sm" onClick={save} busy={busy === "save"} disabled={busy !== null || (!dirty && Boolean(style.confirmed_at))}>
            {style.confirmed_at && !dirty ? "Saved" : "This is right, save it"}
          </Button>
          {connected && <Button size="sm" variant="ghost" onClick={() => read(true)} disabled={busy !== null}>Read again</Button>}
        </div>
      )}
    </div>
  );
}
