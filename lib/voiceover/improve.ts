// The voiceover script, written before any audio is made (the Video editor's
// Add a voiceover). The person describes what it should be about, a rough
// idea, a theme or a few talking points; SOCIA writes one script to be read
// aloud, in the voice's style and the video's length, and changes one thing
// at a time when asked ("make it shorter", "strengthen the hook"). The person
// edits it freely, approves it, and only then is the audio made, word for
// word (lib/voiceover/server.ts writeScript).
//
// Every fact is looked up, never made up, in this order:
//   1. what the person wrote,
//   2. what SOCIA holds about the business (brand facts, what it offers, the
//      facts saved from its website: lib/brandKnowledge.ts),
//   3. the business's own website, read only when a fact is still missing
//      (lib/brandKnowledgeLoad.ts readSite),
//   4. anything still missing is asked of the person and left out until then.
// Server only.
import { anthropic, effortFor, modelFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { readSite } from "@/lib/brandKnowledgeLoad";
import { VOICE_WPS } from "@/lib/studioClips/voiceover";

export type FactSource = { fact: string; from: string };
export type ImprovedVoiceover = { script: string; facts: FactSource[]; questions: string[]; readSite: string | null };

/** The one change a person can ask of a written script; "again" writes a new one. */
export const SCRIPT_CHANGES = {
  shorter: "Make it shorter: cut it to about two thirds, keeping the opening line and the ending.",
  engaging: "Make it more engaging: sharper turns, more concrete detail, a reason to keep listening at each line.",
  hook: "Strengthen the hook: rewrite only the first line so it makes someone stop scrolling. Keep the rest.",
  natural: "Make it more natural: write it the way a person would actually say it out loud, plainer words, contractions.",
  cinematic: "Make it more cinematic: slower, more visual lines, room to breathe between them.",
  less_promo: "Make it less promotional: tell it as a story or a fact worth knowing, keep any ask to one light line at the end.",
  again: "Write a new script from the brief, different from the current one.",
} as const;
export type ScriptChange = keyof typeof SCRIPT_CHANGES;
export const isScriptChange = (v: unknown): v is ScriptChange => typeof v === "string" && v in SCRIPT_CHANGES;

const SYSTEM = `You are the scriptwriter for a short vertical video (Instagram Reels, TikTok, YouTube Shorts) for a business. You write the voiceover that will be read aloud. Return JSON only.

Write for the ear. Open with a line that makes someone stop scrolling, never a greeting or "In this video". Tell it as a small story with a turn and a payoff: what's happening, why it matters, what it leads to. Mix short and longer sentences and leave natural pauses. Use plain, specific words in the business's own voice. End with one clear ask only when it fits the goal; never force one.

Never write: generic AI phrases (unlock, elevate, game-changer, journey, delve, seamless, look no further, whether you're... or...), repeated points, exaggerated claims, hashtags, emoji, stage directions or dashes.

Facts are never made up. A phone number, website, address, price, opening hour, menu item, date, number, achievement or claim may appear only when it is in the owner's words, the business facts or the website pages given to you. Never invent a customer, a review, a testimonial, a statistic or a quote. When the owner asks for something you don't have (for example "give them the number" and no number is given anywhere), leave it out of the script and add a question to "questions" asking for it, naming what was checked ("It isn't in your notes, your saved business facts or on your website."). Don't ask for anything the script doesn't need.

"facts" lists each fact the script uses and where it came from: "your notes", "your business facts" or the website page's address.
"missing" lists what you still need that the website might have, as short plain phrases; empty when you have everything.`;

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    script: { type: "string" },
    facts: { type: "array", items: { type: "object", additionalProperties: false, properties: { fact: { type: "string" }, from: { type: "string" } }, required: ["fact", "from"] } },
    missing: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["script", "facts", "missing", "questions"],
} as const;

type Raw = { script?: unknown; facts?: unknown; missing?: unknown; questions?: unknown };

const strs = (v: unknown, n: number, len: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, len)).slice(0, n) : []);

/** The model's answer, bounded: dashes become commas, and nothing but the four fields survives. */
export function cleanImproved(raw: Raw | null): { script: string; facts: FactSource[]; missing: string[]; questions: string[] } {
  const script = typeof raw?.script === "string" ? raw.script.replace(/\s*[—–]\s*/g, ", ").replace(/[ \t]+/g, " ").trim().slice(0, 1200) : "";
  const facts = (Array.isArray(raw?.facts) ? raw!.facts as unknown[] : []).flatMap((f) => {
    const o = f as { fact?: unknown; from?: unknown };
    return typeof o?.fact === "string" && typeof o.from === "string" && o.fact.trim() ? [{ fact: o.fact.trim().slice(0, 160), from: o.from.trim().slice(0, 160) }] : [];
  }).slice(0, 12);
  return { script, facts, missing: strs(raw?.missing, 6, 80), questions: strs(raw?.questions, 4, 240) };
}

/** Words that fit `seconds` of voice at an unhurried read, never rushed. */
export const wordsFor = (seconds: number) => Math.max(12, Math.round(Math.min(90, Math.max(5, seconds)) * VOICE_WPS));

async function ask(ownerId: string, user: string): Promise<ReturnType<typeof cleanImproved>> {
  const model = modelFor("improve");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.create({ model, max_tokens: 1500, system: SYSTEM, output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(model) }, messages: [{ role: "user", content: user }] } as any);
  recordAiUsage(ownerId, "voiceover_script", res);
  const block = res.content.find((b) => b.type === "text");
  let raw: Raw | null = null;
  try { raw = JSON.parse(block && "text" in block ? block.text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim() : "") as Raw; } catch { raw = null; }
  return cleanImproved(raw);
}

const fence = (t: string) => `<<<\n${t.replace(/<<<|>>>/g, "")}\n>>>`;

/** The script, with where each fact came from and what to ask the person. */
export async function improveVoiceover(args: {
  ownerId: string;
  /** what the voiceover should be about: a rough idea, a theme or talking points */
  notes: string;
  videoBrief: string | null; seconds: number;
  /** the business: lib/prompt.ts brandContext (brand facts, voice, what it offers, the saved website facts) */
  brand: string; niche: string | null; goal: string | null; website: string | null;
  /** the chosen voice's speaking style ("Calm and cinematic") */
  voiceStyle?: string | null;
  /** the person's answers to earlier questions */
  answers?: string | null;
  /** a change to the current script, which comes with it */
  change?: ScriptChange | null; current?: string | null;
}): Promise<ImprovedVoiceover> {
  const base = [
    `The video runs about ${Math.round(args.seconds)} seconds: the script is at most ${wordsFor(args.seconds)} words, read at an easy pace.`,
    args.voiceStyle ? `It is read in a voice that is ${args.voiceStyle.toLowerCase()}: write lines that suit that delivery.` : "",
    args.niche ? `The business's niche: ${args.niche}.` : "",
    args.goal ? `What the business wants from its posts: ${args.goal}.` : "",
    args.brand ? `Business facts SOCIA holds:\n${args.brand}` : "SOCIA holds no business facts for this account.",
    args.videoBrief ? `What the video shows (the owner's brief): ${args.videoBrief}` : "",
    `What the owner wants the voiceover to be about:\n${fence(args.notes)}`,
    args.answers ? `The owner's answers to your earlier questions:\n${fence(args.answers)}` : "",
    args.change && args.current ? `The current script:\n${fence(args.current)}\n\nThe change asked for: ${SCRIPT_CHANGES[args.change]} Keep every fact as it is.` : "",
  ].filter(Boolean).join("\n\n");

  const first = await ask(args.ownerId, base);
  // Something is still missing and the business has a website: read it, and write again with what it says.
  if (first.missing.length && args.website) {
    const site = await readSite(args.website).catch(() => null);
    if (site?.ok) {
      const pages = site.pages.map((p) => `Page: ${p.url}\n${fence(p.text.slice(0, 6000))}`).join("\n\n");
      const second = await ask(args.ownerId, `${base}\n\nYou were missing: ${first.missing.join("; ")}. Here is the business's own website (${args.website}). Use what it says; cite the page address as the source.\n\n${pages}`);
      if (second.script) return { script: second.script, facts: second.facts, questions: second.questions, readSite: args.website };
    }
  }
  if (!first.script) throw new Error("SOCIA couldn't write the voiceover just now. Try again.");
  return { script: first.script, facts: first.facts, questions: first.questions, readSite: null };
}
