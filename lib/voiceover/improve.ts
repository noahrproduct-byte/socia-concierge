// "Auto improve" for a voiceover, before the video is made (the Video
// editor's Add a voiceover): the person's rough notes become the script to be
// read, and every fact in it is looked up, never made up, in this order:
//   1. what the person wrote,
//   2. what SOCIA holds about the business (brand facts, what it offers, the
//      facts on its website that were saved: lib/brandKnowledge.ts),
//   3. the business's website itself, read only when step 2 left a fact
//      missing (lib/brandKnowledgeLoad.ts readSite),
//   4. anything still missing is asked of the person, and left out of the
//      script until they answer.
// The person reads the script, answers or edits, and approves it; the video's
// voiceover then reads those words (lib/voiceover/server.ts writeScript).
// Server only.
import { anthropic, effortFor, modelFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { readSite } from "@/lib/brandKnowledgeLoad";
import { VOICE_WPS } from "@/lib/studioClips/voiceover";

export type FactSource = { fact: string; from: string };
export type ImprovedVoiceover = { script: string; facts: FactSource[]; questions: string[]; readSite: string | null };

const SYSTEM = `You write the voiceover for a short vertical video (Instagram Reels, TikTok, YouTube Shorts) for a business, from the owner's rough notes. Return JSON only.

The script is read aloud by a voice. Write it as spoken words: short sentences, plain and warm, in the business's own voice, no hashtags, no emoji, no stage directions, no dashes. Open with the most interesting line, not a greeting. End with what the owner wants people to do.

Facts are never made up. A phone number, website, address, price, opening hour, menu item, date, number or claim may appear only when it is in the owner's notes, the business facts, or the website pages given to you. When the notes ask for something you don't have (for example "give them the number" and no number is given anywhere), leave it out of the script and add a question to "questions" asking the owner for it, naming what was checked ("It isn't in your notes, your saved business facts or on your website."). Don't ask for anything the notes don't need.

"facts" lists each fact the script uses and where it came from: "your notes", "your business facts" or the website page's address.
"missing" lists what you still need that the website might have (for example "catering phone number"), as short plain phrases; empty when you have everything.`;

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

/** Words that fit `seconds` of voice at an unhurried read. */
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

/** The improved script, with where each fact came from and what to ask the person. */
export async function improveVoiceover(args: {
  ownerId: string; notes: string; videoBrief: string | null; seconds: number;
  /** the business: lib/prompt.ts brandContext (brand facts, what it offers, the saved website facts) */
  brand: string; niche: string | null; website: string | null;
  /** the person's answers to earlier questions */
  answers?: string | null;
}): Promise<ImprovedVoiceover> {
  const base = [
    `The video runs about ${Math.round(args.seconds)} seconds: the script is at most ${wordsFor(args.seconds)} words.`,
    args.niche ? `The business's niche: ${args.niche}.` : "",
    args.brand ? `Business facts SOCIA holds:\n${args.brand}` : "SOCIA holds no business facts for this account.",
    args.videoBrief ? `What the video is (the owner's prompt): ${args.videoBrief}` : "",
    `The owner's notes for the voiceover:\n<<<\n${args.notes.replace(/<<<|>>>/g, "")}\n>>>`,
    args.answers ? `The owner's answers to your earlier questions:\n<<<\n${args.answers.replace(/<<<|>>>/g, "")}\n>>>` : "",
  ].filter(Boolean).join("\n\n");

  const first = await ask(args.ownerId, base);
  // Something is still missing and the business has a website: read it, and write again with what it says.
  if (first.missing.length && args.website) {
    const site = await readSite(args.website).catch(() => null);
    if (site?.ok) {
      const pages = site.pages.map((p) => `Page: ${p.url}\n<<<\n${p.text.replace(/<<<|>>>/g, "").slice(0, 6000)}\n>>>`).join("\n\n");
      const second = await ask(args.ownerId, `${base}\n\nYou were missing: ${first.missing.join("; ")}. Here is the business's own website (${args.website}). Use what it says; cite the page address as the source.\n\n${pages}`);
      if (second.script) return { script: second.script, facts: second.facts, questions: second.questions, readSite: args.website };
    }
  }
  if (!first.script) throw new Error("SOCIA couldn't write the voiceover just now. Try again.");
  return { script: first.script, facts: first.facts, questions: first.questions, readSite: null };
}
