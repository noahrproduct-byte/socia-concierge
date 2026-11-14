// The words a person typed or said about a finished cut, turned into the
// operations in instruct.ts by the fast model. The model never touches the
// cut: it names operations by the cut and line numbers the editor shows, and
// writes one plain sentence back; applyOps does the work and checks it.
// Server only (lib/studioClips/analysis.ts structured).
import { structured } from "./analysis";
import { parseOps, type EditOp } from "./instruct";

// The API's structured output wants every object closed, so one item shape carries every field any
// operation may use; opSchema (instruct.ts) then checks each operation's own shape and bounds.
const num = { type: "number" }, str = { type: "string" }, bool = { type: "boolean" };
const numOrAll = { anyOf: [{ type: "number" }, { type: "string" }] };
const OP_SCHEMA = {
  type: "object", additionalProperties: false, required: ["op"],
  properties: {
    op: str, index: numOrAll, to: num, clip: num, startSec: num, endSec: num, lengthSec: num, level: num, rate: num, kind: str, amount: num, id: str, on: bool,
    preset: str, size: str, position: str, highlight: str, uppercase: bool, animation: str, font: str, box: bool,
    text: str, atSec: num, slot: str, role: str, cta: str, location: str, site: str, off: bool, volume: num, duck: bool, name: str, line: str, color: str, directive: str,
  },
};
const OPS_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { ops: { type: "array", items: OP_SCHEMA }, reply: { type: "string" } },
  required: ["ops", "reply"],
};

const SYSTEM = `You turn what a person says about their short video into edit operations for SOCIA's editor. The cut is described with numbered cuts (shots) and numbered text lines; use those numbers. Answer ONLY with operations from this list, in the order they should happen, and one plain sentence (reply) saying what you are doing, in the person's words, no jargon. Do nothing the person did not ask for.

Operations (JSON objects; "index" is a cut number, or "all"; cut numbers and line numbers are 1-based):
- {"op":"remove_cut","index":N}
- {"op":"trim_cut","index":N,"startSec":S,"endSec":E} (clip-relative seconds) or {"op":"trim_cut","index":N,"lengthSec":L} (keep the first L seconds)
- {"op":"move_cut","index":N,"to":M}
- {"op":"swap_clip","index":N,"clip":C} (C is the clip's number in the project)
- {"op":"volume","index":N|"all"|"silent","level":0..2} (0 mutes; "silent" = every cut where no one speaks; "turn the background sound off" = "silent" at 0)
- {"op":"speed","index":N|"all","rate":0.25..2}
- {"op":"zoom","index":N|"all","kind":"none"|"in"|"out","amount":1.02..1.6}
- {"op":"transition","index":N|"all","kind":"cut"|"fade"|"zoom"|"whip"|"flash"|"tape"|"slide"} ("no transitions" = "cut"; "dissolve" = "fade")
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

Rules: "cut 3" and "the third shot" are cut 3; "the last cut" is the highest number; "the talking part" is the cut whose line says it. A time like "at 5 seconds" is an output time. If the request cannot be done with these operations, return no operations and say so in reply, in one sentence, with what they can do instead. If part can be done, do that part and say what was left out. Never invent clip numbers that are not listed.`;

export async function opsFor(instruction: string, description: string, ownerId: string): Promise<{ ops: EditOp[]; reply: string; rejected: number }> {
  const { data } = await structured<{ ops: unknown[]; reply: string }>("fast", SYSTEM, [{ type: "text", text: `The cut now:\n${description}\n\nThe person says: """${instruction.trim()}"""` }], OPS_SCHEMA, 2000, { ownerId, feature: "studio_instruct" });
  const { ops, rejected } = parseOps(data.ops);
  return { ops, reply: typeof data.reply === "string" ? data.reply.trim().slice(0, 300) : "", rejected };
}
