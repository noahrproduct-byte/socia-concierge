// Creative direction in Ask SOCIA: the styles a reference video can be in,
// the gallery's letters (A to D), and the direction the person chose, carried
// with every later message in the chat so "make it more storytelling" keeps
// the chosen look. The style of a reference is SOCIA's reading of its title,
// length and numbers (it doesn't watch the video), so it is called a style,
// never a verified analysis. Pure and browser-safe.

export const CREATIVE_STYLES = [
  { id: "talking_head_story", label: "Talking-head story", edit: "Person to camera telling it as a story; few cuts, captions on every line" },
  { id: "talking_head_graphics", label: "Talking head with graphics", edit: "Person to camera with animated text, icons or screen inserts over the words" },
  { id: "product_demo", label: "Product demonstration", edit: "The product in use, hands or screen first, a voice or captions explaining each step" },
  { id: "fast_explainer", label: "Fast-paced explainer", edit: "Quick cuts every one to two seconds, bold captions, zooms on the key words" },
  { id: "screen_recording", label: "Screen recording walkthrough", edit: "The screen leads, cursor and zooms show each step, a small face cam or voice-over" },
  { id: "pov_sketch", label: "POV or sketch", edit: "A short acted scene from the viewer's point of view, then the product as the turn" },
  { id: "tutorial", label: "Step-by-step tutorial", edit: "Numbered steps on screen, one clear shot per step, the result first or last" },
  { id: "montage", label: "Montage with music", edit: "Short shots cut to the beat, little or no talking, captions for the message" },
  { id: "animated", label: "Animated explainer", edit: "Motion graphics and kinetic text, no camera, a voice-over or captions" },
] as const;
export type CreativeStyle = (typeof CREATIVE_STYLES)[number]["id"];
export const isCreativeStyle = (v: unknown): v is CreativeStyle => typeof v === "string" && CREATIVE_STYLES.some((s) => s.id === v);
export const styleLabel = (id: CreativeStyle): string => CREATIVE_STYLES.find((s) => s.id === id)?.label ?? id;
export const styleEdit = (id: CreativeStyle): string => CREATIVE_STYLES.find((s) => s.id === id)?.edit ?? "";

export const LETTERS = ["A", "B", "C", "D"] as const;

/** One reference the person can choose, as the chat remembers it. */
export type DirectionRef = { letter: string; style: CreativeStyle; title: string; creator: string; url: string; techniques: string[] };

/** The direction the person chose: one reference, two combined, or their own words. */
export type CreativeDirection = {
  kind: "reference" | "combined" | "own";
  refs: DirectionRef[];
  /** their own description, for kind "own" */
  own?: string;
};

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

export function sanitizeDirection(v: unknown): CreativeDirection | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const kind = o.kind === "reference" || o.kind === "combined" || o.kind === "own" ? o.kind : null;
  if (!kind) return null;
  const refs = (Array.isArray(o.refs) ? o.refs : []).slice(0, 2).map((r) => {
    const x = (r ?? {}) as Record<string, unknown>;
    const url = str(x.url, 300);
    if (!isCreativeStyle(x.style) || !/^https:\/\//.test(url)) return null;
    return { letter: str(x.letter, 1).toUpperCase(), style: x.style, title: str(x.title, 140), creator: str(x.creator, 80), url, techniques: (Array.isArray(x.techniques) ? x.techniques : []).map((t) => str(t, 120)).filter(Boolean).slice(0, 3) };
  }).filter((r): r is DirectionRef => Boolean(r));
  const own = str(o.own, 400);
  if (kind === "own" ? !own : kind === "combined" ? refs.length !== 2 : refs.length !== 1) return null;
  return { kind, refs, ...(kind === "own" ? { own } : {}) };
}

/** The direction as a prompt block for every later message in the chat. */
export function directionBlock(d: CreativeDirection | null): string {
  if (!d) return "";
  const ref = (r: DirectionRef) => `${styleLabel(r.style)} (option ${r.letter}, like "${r.title}" by ${r.creator}): ${styleEdit(r.style)}${r.techniques.length ? `. Techniques to adapt: ${r.techniques.join("; ")}` : ""}`;
  const what = d.kind === "own" ? `In the person's own words: "${d.own}"`
    : d.kind === "combined" ? `Two styles combined:\n- ${ref(d.refs[0])}\n- ${ref(d.refs[1])}\nBlend them: take the structure of the first and the look of the second unless the person says otherwise.`
    : ref(d.refs[0]);
  return `# Creative direction the person chose (keep it for every answer in this chat unless they change it)\n${what}\nAdapt the general techniques only. Never copy the reference's script, footage, branding or distinctive expression; the result is original and made for this brand. Don't show reference examples again unless they ask for different ones.`;
}

/** "I like option B", "go with C", "combine A and C": the gallery letters a message names, in order. */
export function lettersIn(text: string): string[] {
  const t = text.toUpperCase();
  const m = [...t.matchAll(/\b(?:OPTION|STYLE|EXAMPLE|NUMBER|#)?\s*\b([A-D])\b(?=[\s,.!?)]|$)/g)].map((x) => x[1]);
  // Only when the message is about choosing: a bare "a" in a sentence isn't a pick.
  if (!/\b(OPTION|STYLE|EXAMPLE|GO WITH|PICK|CHOOSE|LIKE|COMBINE|MIX|USE)\b/.test(t)) return [];
  return [...new Set(m.filter((x) => x !== "A" || /\b(OPTION|STYLE|EXAMPLE)\s*A\b|\bA\s+AND\b|\bAND\s+A\b/.test(t)))].slice(0, 2);
}

/** The direction a message picks from the last gallery, or null. */
export function directionFromText(text: string, gallery: DirectionRef[]): CreativeDirection | null {
  const letters = lettersIn(text);
  const refs = letters.map((l) => gallery.find((g) => g.letter === l)).filter((r): r is DirectionRef => Boolean(r));
  if (refs.length === 2) return { kind: "combined", refs };
  if (refs.length === 1) return { kind: "reference", refs };
  return null;
}
