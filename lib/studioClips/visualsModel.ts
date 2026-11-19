import { anthropic, effortFor, modelFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { AnalysisError } from "./analysis";
import { countryArt } from "./countryMap";
import { bareDomain, brandLogo } from "./brandLogo";
import { pageCapture, publicPage } from "./pageCapture";
import { sanitizeArt, ART_MAX, type SceneArt } from "./sceneArt";
import { MAX_PICTURES, SCENE_LABEL_MAX, type EdlScene } from "./scenes";
import { FX_LINE_MAX, FX_TEXT_MAX, MAX_EFFECTS, SCENE_FX, isSceneFx, type SceneFxId } from "./sceneFx";

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
- A company or product that is named in the words: {"kind":"logo","brand":"Notion","domain":"notion.so"}. Its real mark is fetched from its website, so give the main website domain of that exact company or product, and only when you are sure of it. Never draw a logo yourself, and never use one for a company that was not named.
- A real web page: {"kind":"page","url":"https://notion.so"}. The page is photographed and shown in a browser window, alone in its scene (give no other drawing with it). Only the home page or a well-known page of a company, product or site that is named in the words, and only when you are sure of the address. At most 2 in a video.
- A thing: {"kind":"draw","name":"warehouse","shapes":[...]}. A bold, flat, simple drawing on a 100 by 100 grid (x right, y down), like a good app icon: 4 to 12 shapes, instantly readable at a glance, filling most of the grid (keep inside 6..94). Each shape is {"d":"<SVG path data>","fill":TONE,"stroke":TONE,"w":N}. TONE is one of "accent" (the brand colour, use it for the main body), "light" (white), "mid" (soft grey, for secondary parts), "dark" (the background colour, for windows, doors and cut-outs on top of filled parts), "none". "w" is the stroke width, 2 to 5. Path data may only use the letters M L H V C S Q T A Z (either case) and numbers. Draw the object itself, front or side view, no text, no people's faces, no logos or brand marks, no flags. A drawing may also carry "move": how the thing behaves once drawn, so it acts the sentence out: "drive" (a vehicle rolling), "spin" (a wheel, a fan, a coin, a loading ring), "bounce" (a ball, something landing or popping), "float" (a balloon, a cloud, something light), "pulse" (a heart, an alarm, a signal), "fill" (a tank, a battery, a glass filling up). Leave it out for things that stand still (a building, a map).
- Several companies named together: give each as its own "logo" drawing in one scene (up to 3) and they stand side by side.

Rules:
- Only picture what is actually said or what the person asked for. Concrete things and places: objects, buildings, vehicles, food, tools, money, countries. Nothing for abstract talk.
- If the person asked for specific pictures, make those, at the word they belong to. If they asked for no pictures, return none.
- At most ${MAX_PICTURES} scenes, at least 3 seconds apart, none in the first second. Fewer and better beats more. Zero is a fine answer when nothing said is picturable and nothing was asked for.
- Headline: 2 to 5 words taken from what is said, no full stop. Optional "label": up to 3 words (a figure or a detail that is said, like "500 rugs").
- "word" is the number of the word the scene starts on. "dur" is seconds, 2.5 to 4.

Effects. Separately from pictures you may give up to ${MAX_EFFECTS} effect scenes: a treatment of the whole frame for 2 to 3.5 seconds on a word. Use them where an editor would: the hook in the first seconds, a big claim, a change of topic. Only when someone is talking to the camera. Never at the same time as a picture scene or another effect (3 seconds apart). If the person asked for an effect by name, use it where they said. With no request, use at most two, and only where the words clearly call for one. Each is {"word":N,"dur":S,"fx":ID,"text":"...","label":"...","lines":["..."]}:
- "ribbon": the signature scene, best on the hook and at most one more time: the room dims, a glowing glass ribbon winds behind the person, a frosted card sits behind their head and a line lands in front of them. text = the card's title, 2 to 4 words naming the subject, the last word being the one to stress; lines = up to 3 card rows of 2 to 4 words (attributes or points that are said; leave out when none are); label = the line in front, 4 to 7 words said at that moment, ending on the word to stress.
- "chat": message bubbles, when a conversation, a DM, a comment or a question someone asked is quoted. text = the first message, lines = up to 3 more, each up to 40 characters, in the order said; they alternate sides.
- "notify": a stack of phone notifications, for results, sales, sign-ups, alerts, reminders. text = the first notification (up to 24 characters), lines = up to 3 more.
- "search": a search bar typing, when something is searched for or typed. text = the query, up to 28 characters.
- "button": a button a cursor clicks, when an action is asked for (comment, follow, save, book, order). text = the words on the button, 1 to 3 words.
- "compare": two options side by side, the second lighting up, for old against new, wrong against right, them against us. text = the first option, label = the second, each 1 to 4 words.
- "canvas": the video becomes a layer in an open design file (a drafting grid, a selection frame, a cursor dragging it), for talk about design, building, editing, making something. text = a 1 to 2 word layer name from what is said.
- "title": a big stacked title, for the hook or the start of a new section. text = 2 to 4 words; label = an optional 1 to 3 word line above it.
- "bars": value bars, when two to four things are compared by a number that is said for each. text = what is compared (2 to 4 words); lines = each thing and its number, like "Us 4.9" or "Old way 12%".
- "table": a small table, for prices, plans, specs. text = a heading; lines = up to 4 rows, cells separated by " | ", like "Starter | $9".
- "flow": steps joined by a line with a tick on the last, for a process said in order. text = the first step; lines = up to 3 more, 1 to 3 words each.
- "code": a code or terminal window typing, only when a command, a prompt or code is said or described. text = the window's title; lines = up to 4 short lines to type.
- "keys": key caps pressing, when a keyboard shortcut is said. text = the keys with + between, like "cmd+shift+4".
- "stamp": one word stamped on, for a verdict: done, banned, free, approved, sold. text = that one word.
- "comment": "Comment" and a keyword typed into a comment box, when viewers are told to comment a word. text = that word.
- "orbit": a hub, for a system, a toolkit, "everything in one place". text = the thing in the middle (1 to 2 words); lines = 2 to 4 things around it, 1 to 2 words each.
- "link": two things joined, for "this connects to that", "works with", "send from A to B". text = the first, label = the second, 1 to 3 words each.
- "picker": a list whose highlight lands on one, for a choice being made or a recommendation among options. text = the one chosen; lines = 2 or 3 other options that are said.
- "filedrop": a file dropped into an upload area, for uploading, dropping in, importing. text = the file's name or kind (1 to 3 words).
- "name": a name spelled out, when a person, a product or a place is introduced by name. text = the name; label = an optional 1 to 3 words on who or what they are.
- "doc": a page with highlighted lines, for a rule, a report, a contract, notes. text = the page's title; lines = up to 3 short lines that are said, to highlight.
- "race": two things racing along two lanes, the first winning, for faster against slower, us against them when speed or progress is the point. text = the winner, label = the other, 1 to 3 words each.
- "cover": magazine cover. text = one masthead word of 4 to 9 letters taken from what is said; label = a 2 to 4 word cover line.
- "glass": one huge see-through word behind the person. text = the one word being stressed (up to 8 letters).
- "graph": a line chart rising behind the person, for growth, money, results. text = the figure said (like "10X", "$5K", "200%"), at most 5 characters.
- "news": headline clippings behind the person, for news, announcements, what people are saying. text and lines = 2 or 3 short headlines (3 to 6 words each) taken from what is said.
- "paper": the person cut out on a paper collage. text = one word of up to 8 letters.
- "sketch": a hand-drawn wobbling line around the person with doodles. No text.
- "dolly": the person pushes toward the camera, for a serious or dramatic line. No text.
- "frame": the video pops into a framed card. text = optional 2 to 5 word line.
- "reveal": the video pulls back into a window. text = a 1 to 3 word window title.
- "phone": a phone slides in with notes on its screen, for apps, messages, steps on a phone. text = a 1 to 3 word title; lines = 2 or 3 lines of 2 to 5 words.

Answer with JSON only, no prose: {"scenes":[{"word":N,"dur":S,"headline":"...","label":"...","art":[...]}],"effects":[{"word":N,"dur":S,"fx":"...","text":"...","label":"...","lines":["..."]}]}`;

export type SaidWord = { text: string; key: string; sec: number };

function jsonIn(text: string): unknown {
  const t = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new AnalysisError("parse", "The pictures came back unreadable.");
  return JSON.parse(t.slice(a, b + 1));
}

/** The model's answer made into picture scenes: countries looked up, drawings checked, anything unusable dropped. Pure. */
export function picturesFrom(data: unknown, said: SaidWord[], logos: Record<string, string> = {}, pages: Record<string, { src: string; host: string }> = {}): EdlScene[] {
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
      else if (r.kind === "page") { const pg = publicPage(r.url); const got = pg ? pages[pg.url] : undefined; if (got) art.push(...sanitizeArt([{ kind: "page", name: got.host, src: got.src }])); }
      else if (r.kind === "logo") { const d = bareDomain(r.domain); if (d && logos[d]) art.push(...sanitizeArt([{ kind: "logo", name: typeof r.brand === "string" ? r.brand : d, src: logos[d] }])); }
      else art.push(...sanitizeArt([r]));
    }
    if (!art.length) continue;
    const headline = typeof o.headline === "string" ? o.headline.replace(/—/g, ",").replace(/\s+/g, " ").replace(/[.]+$/, "").trim().slice(0, 44) : "";
    const label = typeof o.label === "string" ? o.label.replace(/—/g, ",").replace(/\s+/g, " ").trim().slice(0, SCENE_LABEL_MAX) : "";
    const dur = typeof o.dur === "number" && Number.isFinite(o.dur) ? Math.min(4, Math.max(2.5, o.dur)) : 3;
    // A photographed page has the scene to itself.
    const page = art.find((x) => x.kind === "page");
    const shown = page ? [page] : art.slice(0, ART_MAX);
    out.push({ id: `p${out.length + 1}`, kind: "picture", key: at.key, dur, text: headline || shown.map((x) => x.name).filter(Boolean).join(" and "), art: shown, ...(label ? { label } : {}) });
  }
  return out;
}

/** The effect scenes in a model's answer, on the words it names; anything that is not a known effect is dropped. Pure. */
export function effectsFrom(data: unknown, said: SaidWord[]): EdlScene[] {
  const list = (data as { effects?: unknown } | null)?.effects;
  if (!Array.isArray(list)) return [];
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\u2014/g, ",").replace(/\s+/g, " ").trim().slice(0, max) : "");
  const out: EdlScene[] = [];
  for (const raw of list.slice(0, 10)) {
    const o = raw as Record<string, unknown> | null;
    if (!o || out.length >= MAX_EFFECTS || !isSceneFx(o.fx)) continue;
    const at = typeof o.word === "number" ? said[Math.round(o.word) - 1] : undefined;
    if (!at) continue;
    const lines = (Array.isArray(o.lines) ? o.lines : []).map((l) => clean(l, FX_LINE_MAX)).filter(Boolean).slice(0, SCENE_FX[o.fx].lines);
    const label = clean(o.label, SCENE_LABEL_MAX);
    const dur = typeof o.dur === "number" && Number.isFinite(o.dur) ? Math.min(3.5, Math.max(2, o.dur)) : 2.6;
    out.push({ id: `e${out.length + 1}`, kind: "effect", fx: o.fx, key: at.key, dur, text: clean(o.text, FX_TEXT_MAX), ...(label ? { label } : {}), ...(lines.length ? { lines } : {}) });
  }
  return out;
}

export async function picturesFor(said: SaidWord[], prompt: string, ownerId: string, wanted: SceneFxId[] = []): Promise<EdlScene[]> {
  if (!said.length) return [];
  const model = modelFor("studio_edl");
  const words = said.slice(0, 900).map((w, i) => `${i + 1}|${w.sec.toFixed(1)}|${w.text}`).join("\n");
  const user = `The words (number|second|word):\n${words}\n\n${prompt.trim() ? `The person editing asked: """${prompt.trim().slice(0, 1200)}"""` : "The person editing gave no instructions: picture only what clearly deserves it, and use an effect only where the words clearly call for one."}`;
  const picked = wanted.length ? `\n\nThe person picked these effects themselves: ${wanted.map((id) => `"${id}"`).join(", ")}. Use every one of them exactly once, each on the moment in the words it fits best, with its text taken from what is said there. Use no effect they did not pick.` : "";
  const params = { model, max_tokens: 6000, system: SYSTEM, messages: [{ role: "user", content: user + picked }], output_config: { ...effortFor(model, "medium") } };
  // output_config (the effort setting) is ahead of the SDK's types, as in analysis.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.create(params as any);
  recordAiUsage(ownerId, "studio_visuals", res);
  if (res.stop_reason === "refusal") throw new AnalysisError("refusal", "The model declined this request.");
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "";
  if (!text) throw new AnalysisError("empty", "Empty response from the model.");
  const data = jsonIn(text);
  // The marks of the companies named, fetched together; one that cannot be fetched is simply left out of its scene.
  const domains = [...new Set(((data as { scenes?: { art?: { kind?: string; domain?: unknown }[] }[] } | null)?.scenes ?? []).flatMap((s) => (Array.isArray(s?.art) ? s.art : [])).filter((a) => a?.kind === "logo").map((a) => bareDomain(a.domain)).filter((d): d is string => Boolean(d)))].slice(0, 4);
  const found = await Promise.all(domains.map((d) => brandLogo(d)));
  const logos = Object.fromEntries(domains.flatMap((d, i) => (found[i] ? [[d, found[i] as string]] : [])));
  const urls = [...new Set(((data as { scenes?: { art?: { kind?: string; url?: unknown }[] }[] } | null)?.scenes ?? []).flatMap((s) => (Array.isArray(s?.art) ? s.art : [])).filter((a) => a?.kind === "page").map((a) => publicPage(a.url)?.url).filter((u): u is string => Boolean(u)))].slice(0, 2);
  const shots = await Promise.all(urls.map((u) => pageCapture(u)));
  const pages = Object.fromEntries(urls.flatMap((u, i) => (shots[i] ? [[u, shots[i] as { src: string; host: string }]] : [])));
  return [...picturesFrom(data, said, logos, pages), ...effectsFrom(data, said)];
}
