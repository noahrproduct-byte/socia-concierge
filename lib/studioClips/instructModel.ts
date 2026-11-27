import { anthropic, effortFor, modelFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { AnalysisError } from "./analysis";
import { parseOps, type EditOp } from "./instruct";

const SYSTEM = `You turn what a person says about their short video into edit operations for SOCIA's editor. The cut is described with numbered cuts (shots) and numbered text lines; use those numbers. Answer ONLY with operations from this list, in the order they should happen, and one plain sentence (reply) saying what you are doing, in the person's words, no jargon. Do nothing the person did not ask for.

Operations (JSON objects; "index" is a cut number, or "all"; cut numbers and line numbers are 1-based):
- {"op":"remove_cut","index":N}
- {"op":"trim_cut","index":N,"startSec":S,"endSec":E} (clip-relative seconds) or {"op":"trim_cut","index":N,"lengthSec":L} (keep the first L seconds)
- {"op":"move_cut","index":N,"to":M}
- {"op":"swap_clip","index":N,"clip":C} (C is the clip's number in the project)
- {"op":"volume","index":N|"all"|"silent","level":0..2} (0 mutes; "silent" = every cut where no one speaks; "turn the background sound off" = "silent" at 0)
- {"op":"speed","index":N|"all","rate":0.25..2}
- {"op":"zoom","index":N|"all","kind":"none"|"in"|"out","amount":1.02..1.6}
- {"op":"transition","index":N|"all","kind":"cut"|"fade"|"zoom"|"whip"|"flash"|"tape"|"slide"|"leak"|"tear"|"pushin"|"motionblur"} ("no transitions" = "cut"; "dissolve" = "fade"; "paper tear" = "tear"; "push in" = "pushin")
- {"op":"theme","id":"<theme id or name>"}
- {"op":"captions","on":true|false}
- {"op":"caption_style","preset":"classic"|"karaoke"|"highlight"|"pop"|"boxed"|"vox"|"subtitle"|"script","size":"s"|"m"|"l","position":"top"|"middle"|"lower"|"bottom","highlight":"#rrggbb","uppercase":bool,"animation":"none"|"pop"|"rise"|"fade"|"typewriter"|"bounce","font":"<font id>","box":bool} (only the fields asked for; "bigger" = size "l", "smaller" = "s")
- {"op":"text_add","text":"...","atSec":S,"endSec":E,"slot":"top"|"middle"|"bottom","role":"opening"|"mid"|"cta"} (a line on the video; place it over the cut the person names using that cut's play times; 2 to 6 words; never reword what they wrote)
- {"op":"text_edit","index":N,"text":"...","atSec":S,"endSec":E,"slot":...}
- {"op":"text_remove","index":N|"all"}
- {"op":"end_card","cta":"...","location":"...","site":"...","off":bool}
- {"op":"music","on":false} to remove the music; {"op":"music","volume":0..1,"duck":bool} to change it
- {"op":"lower_third","name":"...","line":"...","off":bool}
- {"op":"accent","color":"#rrggbb"}
- {"op":"regenerate","directive":"faster"|"energetic"|"professional"|"shorter"|"different_hook"|"different_clips"} only when the person wants a different cut altogether (a new edit, a different hook, other clips), never for a change this list can make

Rules: "cut 3" and "the third shot" are cut 3; "the last cut" is the highest number; "the talking part" is the cut whose line says it. A time like "at 5 seconds" is an output time. If the request cannot be done with these operations, return no operations and say so in reply, in one sentence, with what they can do instead. If part can be done, do that part and say what was left out. Never invent clip numbers that are not listed. "What is in Clip N" lines say what SOCIA saw when it watched that clip, with moments in clip time: when the person asks for something in the picture (open on a moment, show an action, put a line over a moment), use those moments and their times (trim_cut and move_cut for the shots, text_add over the cut's play time). A clip with no such line was not watched: never guess what is in it, and say in reply that a request about its picture could not be followed.`;

const ANSWER = `\n\nAnswer with JSON only, no prose around it: {"ops":[...],"reply":"..."}.`;

/** The first JSON object in a model's text, fences or not. */
function jsonIn(text: string): unknown {
  const t = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new AnalysisError("parse", "SOCIA's answer came back without a change in it. Try again.");
  return JSON.parse(t.slice(a, b + 1));
}

export async function opsFor(instruction: string, description: string, ownerId: string): Promise<{ ops: EditOp[]; reply: string; rejected: number }> {
  const model = modelFor("fast");
  const params = { model, max_tokens: 1500, system: SYSTEM + ANSWER, messages: [{ role: "user", content: `The cut now:\n${description}\n\nThe person says: """${instruction.trim()}"""` }], output_config: { ...effortFor(model, "low") } };
  // output_config (the effort setting) is ahead of the SDK's types, as in analysis.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.create(params as any);
  recordAiUsage(ownerId, "studio_instruct", res);
  if (res.stop_reason === "refusal") throw new AnalysisError("refusal", "The model declined this request.");
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "";
  if (!text) throw new AnalysisError("empty", "Empty response from the model.");
  const data = jsonIn(text) as { ops?: unknown[]; reply?: string };
  const { ops, rejected } = parseOps(data.ops);
  return { ops, reply: typeof data.reply === "string" ? data.reply.trim().slice(0, 300) : "", rejected };
}
