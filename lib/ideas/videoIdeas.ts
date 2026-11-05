// Video ideas: what to actually film (or animate) next, not just a hook and a
// caption. Each idea is one of the styles the person picked (talking to the
// camera, filmed in person at their place, or an animation with no filming),
// follows the theme of their own posts, and comes with a shot-by-shot plan, the
// words to say, the sound and the length. The model writes; everything here is
// bounded and cleaned, and on-screen text goes through the same "reads like a
// person typed it" rule as text SOCIA puts on videos. Pure.
import { humanText } from "@/lib/studioClips/overlay";
import { pickRef, refLine, sanitizeRef, type ProvenReel, type ReelRef } from "@/lib/trendSignals";

export type IdeaStyle = "face" | "in_person" | "animation";
export const IDEA_STYLES: { id: IdeaStyle; label: string; hint: string }[] = [
  { id: "face", label: "Face to camera", hint: "You talk to the camera" },
  { id: "in_person", label: "In person", hint: "Filmed at your place: people, product, behind the scenes" },
  { id: "animation", label: "Animation", hint: "No filming: text, shapes and motion" },
];
export const isIdeaStyle = (v: unknown): v is IdeaStyle => v === "face" || v === "in_person" || v === "animation";

/**
 * How the idea is filmed, chosen to suit the concept: a funny situation is acted
 * out (sketch or POV), a how-to is shown (demo), news or an opinion is said to
 * the camera. Each style allows only the treatments that fit it.
 */
export type IdeaTreatment = "sketch" | "pov" | "talking" | "demo" | "behind_scenes" | "animation";
export const TREATMENT_LABEL: Record<IdeaTreatment, string> = {
  sketch: "Sketch", pov: "POV", talking: "Talking to camera", demo: "Demo", behind_scenes: "Behind the scenes", animation: "Animation",
};
export const STYLE_TREATMENTS: Record<IdeaStyle, IdeaTreatment[]> = {
  face: ["talking", "sketch", "pov"],
  in_person: ["sketch", "pov", "demo", "behind_scenes"],
  animation: ["animation"],
};
const DEFAULT_TREATMENT: Record<IdeaStyle, IdeaTreatment> = { face: "talking", in_person: "behind_scenes", animation: "animation" };

/**
 * How much the account's own results back the idea. strong: two or more similar
 * posts clearly above the account's median. promising: one similar post above
 * it, or only a small margin. untested: nothing similar posted yet.
 */
export type IdeaEvidence = "strong" | "promising" | "untested";
export const EVIDENCE_LABEL: Record<IdeaEvidence, string> = { strong: "Strong signal", promising: "Promising signal", untested: "Untested idea" };
const isEvidence = (v: unknown): v is IdeaEvidence => v === "strong" || v === "promising" || v === "untested";

export type IdeaShot = { from: number; to: number; onCamera: string; onScreenText: string | null; say: string | null };
export type IdeaSound = { kind: "original" | "music" | "voiceover"; feel: string };
export type VideoIdea = {
  id: string;
  title: string;
  style: IdeaStyle;
  treatment: IdeaTreatment;
  /** null on ideas written before SOCIA labelled its evidence */
  evidence: IdeaEvidence | null;
  /** what the video is, in one or two sentences */
  premise: string;
  /** which of the account's own posts or patterns it follows; "" when SOCIA has too little to go on */
  themeFit: string;
  lengthSec: number;
  sound: IdeaSound;
  shots: IdeaShot[];
  /** the words to say, start to finish ("" for an idea with nothing said) */
  script: string;
  caption: string;
  /** what it takes to make: people, place, props, time */
  needs: string;
  /** the niche Reel the idea is built on, with the numbers SOCIA read for it; null when it is built on none (and on older ideas) */
  ref?: ReelRef | null;
};
export type IdeaSet = { at: string; styles: IdeaStyle[]; about: string | null; ideas: VideoIdea[] };

export const IDEA_COUNT = 5;
export const MIN_SEC = 6;
export const MAX_SEC = 90;

export const IDEAS_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string" },
          style: { type: "string", enum: ["face", "in_person", "animation"] },
          treatment: { type: "string", enum: ["sketch", "pov", "talking", "demo", "behind_scenes", "animation"] },
          evidence: { type: "string", enum: ["strong", "promising", "untested"] },
          premise: { type: "string" },
          themeFit: { type: "string" },
          lengthSec: { type: "integer" },
          sound: { type: "object", additionalProperties: false, properties: { kind: { type: "string", enum: ["original", "music", "voiceover"] }, feel: { type: "string" } }, required: ["kind", "feel"] },
          shots: {
            type: "array",
            items: { type: "object", additionalProperties: false, properties: { from: { type: "number" }, to: { type: "number" }, onCamera: { type: "string" }, onScreenText: { type: "string" }, say: { type: "string" } }, required: ["from", "to", "onCamera", "onScreenText", "say"] },
          },
          script: { type: "string" },
          caption: { type: "string" },
          needs: { type: "string" },
          reference: { type: "string" },
        },
        required: ["title", "style", "treatment", "evidence", "premise", "themeFit", "lengthSec", "sound", "shots", "script", "caption", "needs", "reference"],
      },
    },
  },
  required: ["ideas"],
} as const;

/** Plain prose: no em or en dashes, single spaces, bounded. */
const plain = (v: unknown, n: number): string =>
  typeof v === "string" ? v.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, " to ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n) : "";
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The model's ideas, bounded: only the styles the person picked, shots in
 * order and inside the length (the last one ends at the end), on-screen text
 * a person would type or none, at most IDEA_COUNT.
 */
export function cleanIdeas(raw: unknown, styles: IdeaStyle[], ids: () => string, proven: ProvenReel[] = []): VideoIdea[] {
  const o = (raw && typeof raw === "object" ? raw : {}) as { ideas?: unknown };
  const allowed = new Set(styles.length ? styles : IDEA_STYLES.map((s) => s.id));
  const seen = new Set<string>();
  return (Array.isArray(o.ideas) ? o.ideas : []).flatMap((x): VideoIdea[] => {
    if (!x || typeof x !== "object") return [];
    const i = x as Record<string, unknown>;
    const style = isIdeaStyle(i.style) ? i.style : null;
    const title = plain(i.title, 80).replace(/^["'“”]+|["'“”.]+$/g, "");
    const premise = plain(i.premise, 400);
    if (!style || !allowed.has(style) || !title || !premise || seen.has(title.toLowerCase())) return [];
    const lengthSec = Math.round(Math.min(MAX_SEC, Math.max(MIN_SEC, typeof i.lengthSec === "number" ? i.lengthSec : 20)));
    const shots = (Array.isArray(i.shots) ? i.shots : []).flatMap((s): IdeaShot[] => {
      if (!s || typeof s !== "object") return [];
      const v = s as Record<string, unknown>;
      const onCamera = plain(v.onCamera, 300);
      if (!onCamera) return [];
      const from = typeof v.from === "number" && Number.isFinite(v.from) ? Math.max(0, v.from) : 0;
      const to = typeof v.to === "number" && Number.isFinite(v.to) ? v.to : from + 3;
      return [{ from, to, onCamera, onScreenText: typeof v.onScreenText === "string" && v.onScreenText.trim() ? humanText(v.onScreenText) : null, say: plain(v.say, 400) || null }];
    }).sort((a, b) => a.from - b.from).slice(0, 10);
    // Inside the length, in order, the last shot running to the end.
    const fitted = shots.filter((s) => s.from < lengthSec).map((s, k, all) => {
      const next = all[k + 1];
      const to = next ? Math.min(Math.max(s.to, s.from + 0.5), next.from) : lengthSec;
      return { ...s, from: r1(s.from), to: r1(Math.min(lengthSec, Math.max(to, s.from + 0.5))) };
    });
    if (!fitted.length) return [];
    seen.add(title.toLowerCase());
    const kind = (i.sound as { kind?: unknown } | undefined)?.kind;
    const sound: IdeaSound = { kind: kind === "music" || kind === "voiceover" ? kind : "original", feel: plain((i.sound as { feel?: unknown } | undefined)?.feel, 160) };
    const treatment = STYLE_TREATMENTS[style].includes(i.treatment as IdeaTreatment) ? (i.treatment as IdeaTreatment) : DEFAULT_TREATMENT[style];
    return [{
      id: ids(), title, style, treatment, evidence: isEvidence(i.evidence) ? i.evidence : null, premise, themeFit: plain(i.themeFit, 400), lengthSec, sound, shots: fitted,
      script: style === "animation" && sound.kind !== "voiceover" ? "" : plain(i.script, 1500),
      caption: plain(i.caption, 600), needs: plain(i.needs, 300),
      // A fresh idea cites a listed Reel by id; a stored one already carries the Reel.
      ref: pickRef(i.reference, proven) ?? sanitizeRef(i.ref),
    }];
  }).slice(0, IDEA_COUNT);
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const SOUND: Record<IdeaSound["kind"], string> = { original: "Its own sound", music: "Music", voiceover: "Voiceover" };

/** The whole idea as text, to copy or to hand to the Video editor as a prompt. */
export function ideaText(idea: VideoIdea): string {
  const style = TREATMENT_LABEL[idea.treatment] ?? IDEA_STYLES.find((s) => s.id === idea.style)?.label ?? idea.style;
  return [
    `${idea.title} (${style}, about ${idea.lengthSec} seconds)`,
    idea.premise,
    "",
    ...idea.shots.map((s) => `${clock(s.from)} to ${clock(s.to)}: ${s.onCamera}${s.onScreenText ? ` On screen: "${s.onScreenText}".` : ""}${s.say ? ` Say: "${s.say}"` : ""}`),
    "",
    `Sound: ${SOUND[idea.sound.kind]}${idea.sound.feel ? `, ${idea.sound.feel}` : ""}.`,
    idea.needs ? `You need: ${idea.needs}` : "",
    idea.ref ? `Built on a Reel that took off: ${refLine(idea.ref)}. ${idea.ref.url}` : "",
    idea.caption ? `Caption: ${idea.caption}` : "",
  ].filter((l, k, a) => !(l === "" && a[k - 1] === "")).join("\n").trim();
}

/** A stored set, bounded; anything malformed is dropped. */
export function sanitizeIdeaSet(v: unknown): IdeaSet | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const styles = (Array.isArray(o.styles) ? o.styles : []).filter(isIdeaStyle);
  let n = 0;
  const ideas = cleanIdeas({ ideas: o.ideas }, styles, () => `i${n++}`).map((idea, k) => {
    const src = (o.ideas as Record<string, unknown>[])[k];
    return typeof src?.id === "string" && /^[a-z0-9]{1,24}$/i.test(src.id) ? { ...idea, id: src.id } : idea;
  });
  if (!ideas.length) return null;
  return { at: typeof o.at === "string" ? o.at.slice(0, 30) : "", styles, about: typeof o.about === "string" ? o.about.slice(0, 200) : null, ideas };
}
