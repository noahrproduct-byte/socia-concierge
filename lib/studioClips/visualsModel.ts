import { anthropic, effortFor, modelFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { AnalysisError } from "./analysis";
import { countryArt } from "./countryMap";
import { sanitizeArt, ART_MAX, type SceneArt } from "./sceneArt";
import { MAX_PICTURES, SCENE_LABEL_MAX, type EdlScene } from "./scenes";

// Picture scenes from what is said and what the person asked for: the model
// reads the cut's words (numbered, with their times) and the person's prompt,
// picks the few moments worth a picture, and draws each one: a country as a
// map (it only names the country; the outline is real, from countryMap.ts) or
// a thing as a flat drawing of a few shapes. Everything it returns is checked
// by sanitizeArt before it reaches a cut.

const SYSTEM = `You are the motion designer for SOCIA's short-video editor. You are given the words said in a short vertical video, numbered, each with the second it is said, and sometimes what the person editing asked for. Choose the moments that deserve a picture on screen and design each one.

A picture scene shows 1 to 3 drawings side by side with a short headline under them, for 2.5 to 4 seconds, starting on the word it is about. Example: for "I bought a warehouse in Egypt" at the word "warehouse": a drawing of a warehouse and a map of Egypt, headline "Warehouse in Egypt".

Drawings, two kinds:
- A country: {"kind":"map","country":"Egypt"}. Only real countries. Never draw a country yourself.
- A thing: {"kind":"draw","name":"warehouse","shapes":[...]}. A bold, flat, simple drawing on a 100 by 100 grid (x right, y down), like a good app icon: 4 to 12 shapes, instantly readable at a glance, filling most of the grid (keep inside 6..94). Each shape is {"d":"<SVG path data>","fill":TONE,"stroke":TONE,"w":N}. TONE is one of "accent" (the brand colour, use it for the main body), "light" (white), "mid" (soft grey, for secondary parts), "dark" (the background colour, for windows, doors and cut-outs on top of filled parts), "none". "w" is the stroke width, 2 to 5. Path data may only use the letters M L H V C S Q T A Z (either case) and numbers. Draw the object itself, front or side view, no text, no people's faces, no logos or brand marks, no flags.

Rules:
- Only picture what is actually said or what the person asked for. Concrete things and places: objects, buildings, vehicles, food, tools, money, countries. Nothing for abstract talk.
- If the person asked for specific pictures, make those, at the word they belong to. If they asked for no pictures, return none.
- At most ${MAX_PICTURES} scenes, at least 3 seconds apart, none in the first second. Fewer and better beats more. Zero is a fine answer when nothing said is picturable and nothing was asked for.
- Headline: 2 to 5 words taken from what is said, no full stop. Optional "label": up to 3 words (a figure or a detail that is said, like "500 rugs").
- "word" is the number of the word the scene starts on. "dur" is seconds, 2.5 to 4.

Answer with JSON only, no prose: {"scenes":[{"word":N,"dur":S,"headline":"...","label":"...","art":[...]}]}`;

export type SaidWord = { text: string; key: string; sec: number };

function jsonIn(text: string): unknown {
  const t = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new AnalysisError("parse", "The pictures came back unreadable.");
  return JSON.parse(t.slice(a, b + 1));
}

/** The model's answer made into picture scenes: countries looked up, drawings checked, anything unusable dropped. Pure. */
export function picturesFrom(data: unknown, said: SaidWord[]): EdlScene[] {
  const list = (data as { scenes?: unknown } | null)?.scenes;
  if (!Array.isArray(list)) return [];
  const out: EdlScene[] = [];
  for (const raw of list.slice(0, 12)) {
    const o = raw as Record<string, unknown> | null;
    if (!o || out.length >= MAX_PICTURES) continue;
    const at = typeof o.word === "number" ? said[Math.round(o.word) - 1] : undefined;
    if (!at) continue;
    const art: SceneArt[] = [];
    for (const a of Array.isArray(o.art) ? o.art.slice(0, 6) : []) {
      const r = a as Record<string, unknown> | null;
      if (!r || art.length >= ART_MAX) continue;
      if (r.kind === "map") { const m = typeof r.country === "string" ? countryArt(r.country) : null; if (m) art.push(m); }
      else art.push(...sanitizeArt([r]));
    }
    if (!art.length) continue;
    const headline = typeof o.headline === "string" ? o.headline.replace(/—/g, ",").replace(/\s+/g, " ").replace(/[.]+$/, "").trim().slice(0, 44) : "";
    const label = typeof o.label === "string" ? o.label.replace(/—/g, ",").replace(/\s+/g, " ").trim().slice(0, SCENE_LABEL_MAX) : "";
    const dur = typeof o.dur === "number" && Number.isFinite(o.dur) ? Math.min(4, Math.max(2.5, o.dur)) : 3;
    out.push({ id: `p${out.length + 1}`, kind: "picture", key: at.key, dur, text: headline || art.map((x) => x.name).filter(Boolean).join(" and "), art: art.slice(0, ART_MAX), ...(label ? { label } : {}) });
  }
  return out;
}

export async function picturesFor(said: SaidWord[], prompt: string, ownerId: string): Promise<EdlScene[]> {
  if (!said.length) return [];
  const model = modelFor("studio_edl");
  const words = said.slice(0, 900).map((w, i) => `${i + 1}|${w.sec.toFixed(1)}|${w.text}`).join("\n");
  const user = `The words (number|second|word):\n${words}\n\n${prompt.trim() ? `The person editing asked: """${prompt.trim().slice(0, 1200)}"""` : "The person editing gave no instructions: picture only what clearly deserves it."}`;
  const params = { model, max_tokens: 6000, system: SYSTEM, messages: [{ role: "user", content: user }], output_config: { ...effortFor(model, "medium") } };
  // output_config (the effort setting) is ahead of the SDK's types, as in analysis.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.create(params as any);
  recordAiUsage(ownerId, "studio_visuals", res);
  if (res.stop_reason === "refusal") throw new AnalysisError("refusal", "The model declined this request.");
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "";
  if (!text) throw new AnalysisError("empty", "Empty response from the model.");
  return picturesFrom(jsonIn(text), said);
}
