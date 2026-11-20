"use client";

// What SOCIA understood about an account from watching its Reels
// (lib/intel/reelRead.ts), for the person to confirm or change (Noah,
// 2026-11-14: "Socia automatically fills it out and the user can say yes or
// no, like see how it is, and can change it if they want"). Used in
// onboarding's "Your account" step and in Settings. Every plan, idea and
// animated post is written from what is confirmed here (lib/brandBrief.ts).
import { useState } from "react";
import { Field, Input, Switch, Textarea } from "@/components/system";
import { confidenceLabel } from "@/lib/intel/understanding";
import { MADE, MADE_LABEL, type Made, type VisualRead } from "@/lib/intel/reelReadCore";
import type { BrandFormat } from "@/lib/brandBrief";
import type { BrandDetail } from "@/lib/profile";

export type FormatRow = BrandFormat & {
  keep: boolean;
  /** From the read, when this kind came from it: how it does and one example. */
  stats?: { reels: number; avg: number | null; metric: "views" | "interactions"; multiple: number | null } | null;
  example?: { permalink: string | null; thumb: string | null } | null;
};

export type BrandReadValue = { description: string; look: string; formats: FormatRow[] };

/** The form's starting values: what the person confirmed, else what SOCIA read. Pure. */
export function seedBrandRead(visual: VisualRead | null | undefined, detail: BrandDetail | null | undefined, thumbs: Record<string, string> = {}): BrandReadValue {
  const read = visual?.formats ?? [];
  const fromRead = (name: string) => read.find((f) => f.name.toLowerCase() === name.toLowerCase());
  const withRead = (f: (typeof read)[number] | undefined) =>
    f
      ? {
          stats: { reels: f.ids.length, avg: f.avg, metric: f.metric, multiple: f.multiple },
          // A fresher cover from the latest sync when there is one: Instagram's image links expire.
          example: f.example ? { permalink: f.example.permalink, thumb: thumbs[f.ids[0]] ?? f.example.thumb } : null,
        }
      : {};
  const confirmed = detail?.formats ?? [];
  const formats: FormatRow[] = confirmed.length
    ? confirmed.map((f) => ({ ...f, keep: true, ...withRead(fromRead(f.name)) }))
    : read.map((f) => ({ name: f.name, made: f.made, look: f.look, keep: true, ...withRead(f) }));
  return {
    description: detail?.description || visual?.about?.value || "",
    look: detail?.look || visual?.look || "",
    formats,
  };
}

/** What to save from the form: the description, the look, and only the kinds the person kept. Pure. */
export function brandReadToSave(v: BrandReadValue): { description: string; look: string; formats: BrandFormat[] } {
  return {
    description: v.description.trim(),
    look: v.look.trim(),
    formats: v.formats.filter((f) => f.keep && f.name.trim() && f.look.trim()).map((f) => ({ name: f.name.trim(), made: f.made, look: f.look.trim() })),
  };
}

function statsLine(s: NonNullable<FormatRow["stats"]>): string {
  const parts = [`${s.reels} of the Reels SOCIA watched`];
  if (s.avg != null) parts.push(`about ${s.avg.toLocaleString("en-US")} ${s.metric} each`);
  if (s.multiple != null) parts.push(s.multiple >= 1.15 || s.multiple <= 0.85 ? `${s.multiple}x your usual` : "about your usual");
  return parts.join(", ");
}

function Cover({ src }: { src: string | null | undefined }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className="br-cover br-cover-empty" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="br-cover" src={src} alt="" width={54} height={96} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setBroken(true); }} />;
}

export default function BrandRead({ visual, value, onChange }: { visual: VisualRead | null | undefined; value: BrandReadValue; onChange: (v: BrandReadValue) => void }) {
  const setFormat = (i: number, patch: Partial<FormatRow>) => onChange({ ...value, formats: value.formats.map((f, k) => (k === i ? { ...f, ...patch } : f)) });
  const aboutFromRead = Boolean(visual?.about && value.description === visual.about.value);

  return (
    <div className="br">
      <div className="br-block">
        <Field label="What the account is about" hint={aboutFromRead && visual?.about ? `${confidenceLabel(visual.about.confidence)}${visual.about.evidence[0] ? `: ${visual.about.evidence[0]}` : ""}` : "One or two sentences: what it is, what it sells or makes, who it's for."}>
          <Textarea rows={3} maxLength={600} value={value.description} placeholder="e.g. A pre-launch app for indoor climbers that scans the wall and suggests moves that fit your body" onChange={(e) => onChange({ ...value, description: e.target.value })} />
        </Field>
      </div>

      <div className="br-block">
        <span className="s-label">What you post</span>
        {value.formats.length ? (
          <>
            <p className="br-note">{visual ? `SOCIA watched ${visual.reels} of your Reels. Keep the kinds that are yours, switch off the ones that aren't, and fix any description.` : "The kinds of video you confirmed."}</p>
            <ul className="br-formats">
              {value.formats.map((f, i) => (
                <li key={i} className={f.keep ? "" : "off"}>
                  {f.example?.permalink ? (
                    <a href={f.example.permalink} target="_blank" rel="noreferrer" aria-label={`Open an example of ${f.name} on Instagram`}><Cover src={f.example.thumb} /></a>
                  ) : (
                    <Cover src={f.example?.thumb} />
                  )}
                  <div className="br-format-body">
                    <div className="br-format-head">
                      <Input aria-label="Name of this kind of video" autoComplete="off" maxLength={40} value={f.name} disabled={!f.keep} onChange={(e) => setFormat(i, { name: e.target.value })} />
                      <select className="s-input br-made" aria-label="How it's made" value={f.made} disabled={!f.keep} onChange={(e) => setFormat(i, { made: e.target.value as Made })}>
                        {MADE.map((m) => <option key={m} value={m}>{MADE_LABEL[m]}</option>)}
                      </select>
                      <span className="br-keep">
                        <Switch label={`${f.name || "This kind"} is one of mine`} checked={f.keep} onCheckedChange={(on) => setFormat(i, { keep: on })} />
                        <small>{f.keep ? "Yours" : "Not yours"}</small>
                      </span>
                    </div>
                    <Textarea aria-label="What it looks like" rows={2} maxLength={320} value={f.look} disabled={!f.keep} onChange={(e) => setFormat(i, { look: e.target.value })} />
                    {f.stats && <small className="br-stats">{statsLine(f.stats)}</small>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="br-note">{visual ? "SOCIA couldn't see a kind of video that repeats across your Reels yet." : "SOCIA hasn't watched your Reels yet."}</p>
        )}
      </div>

      <div className="br-block">
        <Field label="Your look" optional hint="What your videos share: colours, type, logo, characters.">
          {/* Not an address: browsers once filled a street name in here, and every plan repeated it as the "look". */}
          <Input name="socia-video-look" autoComplete="off" data-1p-ignore data-lpignore="true" maxLength={240} value={value.look} placeholder="e.g. Dark navy, bold condensed yellow headlines, the green logo top right" onChange={(e) => onChange({ ...value, look: e.target.value })} />
        </Field>
      </div>
      {visual && visual.limitations.length > 0 && <p className="br-note">{visual.limitations.join(" ")}</p>}
    </div>
  );
}
