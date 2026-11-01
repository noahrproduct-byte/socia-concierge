// Video ideas: what to actually film (or animate) next, not just a hook and a
// caption. Each idea is one of the styles the person picked (talking to the
// camera, filmed in person at their place, or an animation with no filming),
// follows the theme of their own posts, and comes with a shot-by-shot plan, the
// words to say, the sound and the length. The model writes; everything here is
// bounded and cleaned, and on-screen text goes through the same "reads like a
// person typed it" rule as text SOCIA puts on videos. Pure.
import { humanText } from "@/lib/studioClips/overlay";

export type IdeaStyle = "face" | "in_person" | "animation";
export const IDEA_STYLES: { id: IdeaStyle; label: string; hint: string }[] = [
  { id: "face", label: "Face to camera", hint: "You talk to the camera" },
  { id: "in_person", label: "In person", hint: "Filmed at your place: people, product, behind the scenes" },
  { id: "animation", label: "Animation", hint: "No filming: text, shapes and motion" },
];
export const isIdeaStyle = (v: unknown): v is IdeaStyle => v === "face" || v === "in_person" || v === "animation";

export type IdeaShot = { from: number; to: number; onCamera: string; onScreenText: string | null; say: string | null };
export type IdeaSound = { kind: "original" | "music" | "voiceover"; feel: string };
export type VideoIdea = {
  id: string;
  title: string;
  style: IdeaStyle;
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
        },
        required: ["title", "style", "premise", "themeFit", "lengthSec", "sound", "shots", "script", "caption", "needs"],
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
export function cleanIdeas(raw: unknown, styles: IdeaStyle[], ids: () => string): VideoIdea[] {
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
    return [{
      id: ids(), title, style, premise, themeFit: plain(i.themeFit, 400), lengthSec, sound, shots: fitted,
      script: style === "animation" && sound.kind !== "voiceover" ? "" : plain(i.script, 1500),
      caption: plain(i.caption, 600), needs: plain(i.needs, 300),
    }];
  }).slice(0, IDEA_COUNT);
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const SOUND: Record<IdeaSound["kind"], string> = { original: "Its own sound", music: "Music", voiceover: "Voiceover" };

/** The whole idea as text, to copy or to hand to the Video editor as a prompt. */
export function ideaText(idea: VideoIdea): string {
  const style = IDEA_STYLES.find((s) => s.id === idea.style)?.label ?? idea.style;
  return [
    `${idea.title} (${style}, about ${idea.lengthSec} seconds)`,
    idea.premise,
    "",
    ...idea.shots.map((s) => `${clock(s.from)} to ${clock(s.to)}: ${s.onCamera}${s.onScreenText ? ` On screen: "${s.onScreenText}".` : ""}${s.say ? ` Say: "${s.say}"` : ""}`),
    "",
    `Sound: ${SOUND[idea.sound.kind]}${idea.sound.feel ? `, ${idea.sound.feel}` : ""}.`,
    idea.needs ? `You need: ${idea.needs}` : "",
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
