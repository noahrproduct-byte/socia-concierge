"use client";

// The brand's logo on a cut, in the Words tool (lib/studioClips/types.ts
// EdlLogo): pick an image once, then choose where it shows: in the corner for
// the whole video, on the ending, or both. The image is made small in the
// browser (lib/studioClips/logoImage.ts) and kept with the cut.
import { useRef, useState } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import type { EdlLogo } from "@/lib/studioClips/types";
import { logoFromFile } from "@/lib/studioClips/logoImage";

export default function LogoPanel({ logo, disabled, hasEndCard, onChange }: {
  logo: EdlLogo | undefined;
  disabled: boolean;
  /** the cut has an ending card, so the logo lands above its lines */
  hasEndCard: boolean;
  onChange: (logo: EdlLogo | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    const r = await logoFromFile(file);
    if ("error" in r) { setNote(r.error); return; }
    setNote(null);
    onChange({ ...(logo ?? { corner: true as const, ending: true as const }), src: r.src });
  };
  // A logo that shows nowhere is not kept, so the last place cannot be switched off; Remove takes it out.
  const place = (key: "corner" | "ending", on: boolean) => {
    if (!logo) return;
    const { [key]: _old, ...rest } = logo; void _old;
    const next: EdlLogo = on ? { ...rest, [key]: true } : rest;
    if (next.corner || next.ending) onChange(next);
  };
  const only = logo ? (logo.corner ? 1 : 0) + (logo.ending ? 1 : 0) === 1 : false;
  return (
    <div className="ov-card cbb-caption-copy">
      <b><ImageIcon size={14} aria-hidden /> Logo</b>
      <small className="sd-fx-note">Your logo on the video: small in the top corner the whole way through, and landing on the ending. A PNG with a see-through background looks best.</small>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      {logo && (
        <div className="sd-scene">
          <div className="sd-scene-head">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL kept with the cut */}
            <img className="sd-logo-thumb" src={logo.src} alt="The logo on this video" />
            <button type="button" className="ov-btn ghost small" disabled={disabled} onClick={() => onChange(undefined)}><Trash2 size={12} aria-hidden /> Remove</button>
          </div>
          <label className="cbb-check"><input type="checkbox" checked={Boolean(logo.corner)} disabled={disabled || (only && Boolean(logo.corner))} onChange={(e) => place("corner", e.target.checked)} /> In the top corner for the whole video</label>
          <label className="cbb-check"><input type="checkbox" checked={Boolean(logo.ending)} disabled={disabled || (only && Boolean(logo.ending))} onChange={(e) => place("ending", e.target.checked)} /> On the ending</label>
          {logo.ending && !hasEndCard && (
            <div className="cbb-endcard-fields">
              <label>Name under it<input type="text" maxLength={40} value={logo.name ?? ""} disabled={disabled} placeholder="The business" onChange={(e) => onChange({ ...logo, name: e.target.value })} /></label>
            </div>
          )}
          <small className="sd-fx-note">{logo.ending ? (hasEndCard ? "On the ending it lands above the ending card's lines." : "On the ending the picture dims for the last second and a half and the logo lands in the middle.") : "Shown in the corner only."}</small>
        </div>
      )}
      <div className="sd-done-actions">
        <button type="button" className="ov-btn ghost small" disabled={disabled} onClick={() => input.current?.click()}><Upload size={12} aria-hidden /> {logo ? "Use another image" : "Add a logo"}</button>
      </div>
      {note && <small className="sd-fx-note" role="alert">{note}</small>}
    </div>
  );
}
