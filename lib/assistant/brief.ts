// The creative brief Ask SOCIA keeps across a chat, how each new message is read against it, and the
// checks an answer passes before it is shown (Noah, 2026-11-18, "AI assistant quality overhaul").
//
// What went wrong before, found in the pipeline (app/api/ask/route.ts):
// - every follow-up was treated as a new request: research ran again, the research card and a full
//   script template (caption, sound, filming notes, editing) came back each time, whatever was asked;
// - nothing carried the requirements forward except the raw chat, trimmed per message, so "make it more
//   storytelling" could lose the topic and "only the spoken lines" lost to the template;
// - a script was cut at 4,000 characters before it was shown, silently, and an answer stopped by the
//   output limit wasn't detected;
// - the "photos of your place" box sat under every script, so an app explainer asked for storefront photos.
//
// So: each message is read into a turn (new request, revision, format change, "again in full", question)
// and a deliverable (full script, spoken lines only, filming guide, caption, hooks, research, an answer);
// the brief is updated every turn and sent back with the next one; the prompt is built for that turn only;
// and the answer is checked (and fixed without another model call where it can be) before it is shown.
//
// Pure and browser-safe.

export const DELIVERABLES = ["full_script", "spoken_lines", "filming_guide", "caption", "hooks", "research", "answer"] as const;
export type Deliverable = (typeof DELIVERABLES)[number];

/** How a message relates to the work so far. */
export type Turn =
  | "new"       // a new piece of work: research may run, the brief starts again
  | "revise"    // change the current piece: keep everything else in the brief
  | "format"    // the same piece, shown another way (only the lines, the filming guide)
  | "again"     // the same piece again, complete (it was cut off, or "the whole thing again")
  | "question"; // a question or anything that isn't about the piece

export type CreativeBrief = {
  contentType: string;   // "Instagram Reel, on camera"
  topic: string;
  audience: string;
  platform: string;
  goal: string;
  hook: string;          // the exact hook when the person set one
  duration: string;      // "about 45 seconds"
  mustInclude: string[]; // features, talking points, products that have to be in it
  tone: string;
  structure: string;     // "story: problem, turning point, result", "onboarding walkthrough"
  cta: string;
  output: Deliverable;   // the format the person wants it in now
  corrections: string[]; // what the person corrected, in their words, newest last
};

export const EMPTY_BRIEF: CreativeBrief = {
  contentType: "", topic: "", audience: "", platform: "", goal: "", hook: "", duration: "",
  mustInclude: [], tone: "", structure: "", cta: "", output: "full_script", corrections: [],
};

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number): string[] =>
  [...new Set((Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean))].slice(-n);

/** A brief from the model or the browser, bounded; null when it holds nothing. */
export function sanitizeBrief(v: unknown): CreativeBrief | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const b: CreativeBrief = {
    contentType: str(o.contentType, 120), topic: str(o.topic, 300), audience: str(o.audience, 200), platform: str(o.platform, 60),
    goal: str(o.goal, 200), hook: str(o.hook, 300), duration: str(o.duration, 60), mustInclude: list(o.mustInclude, 15, 160),
    tone: str(o.tone, 120), structure: str(o.structure, 200), cta: str(o.cta, 200),
    output: DELIVERABLES.includes(o.output as Deliverable) ? (o.output as Deliverable) : "full_script",
    corrections: list(o.corrections, 8, 300),
  };
  const filled = Object.entries(b).some(([k, x]) => k !== "output" && (Array.isArray(x) ? x.length > 0 : Boolean(x)));
  return filled ? b : null;
}

// ---- reading a message ---------------------------------------------------------------------------

const SPOKEN = /\b(only|just)\b[^.?!]{0,40}\b(spoken|lines|dialogue|dialog|words|voice ?over|what (?:i|to) say|the script part)\b|\b(spoken|my) lines only\b|\bonly what i (?:say|read)\b|\bjust (?:the )?(?:spoken )?script\b/i;
const FILMING = /\b(filming (?:guide|instructions|directions|notes|plan)|shot ?list|how (?:do|should|would) i film|how to film|show (?:me )?(?:the )?filming)\b/i;
const CAPTION = /\b(write|give|make|need|draft)\b[^.?!]{0,30}\bcaption\b|\bcaption (?:for|please)\b|^caption\b/i;
const HOOKS = /\b(write|give|more|other|new|some|\d+)\b[^.?!]{0,20}\bhooks\b|\bhook options\b/i;
const AGAIN = /\b(cut off|got cut|truncat\w*|didn'?t finish|isn'?t finished|incomplete|stopped (?:mid|half)|unfinished)\b|\b(?:complete|full|whole|entire)\b[^.?!]{0,25}\b(?:script|thing|version|text)\b[^.?!]{0,20}\bagain\b|\b(?:send|give|show|write)\b[^.?!]{0,15}\b(?:it|the (?:script|whole thing|full script))\b[^.?!]{0,15}\b(?:again|in full)\b|^(?:the )?(?:complete|full|whole) (?:script|thing)\b/i;
const FULL = /\b(full|complete|whole|entire)\s+script\b|\bwith (?:the )?(?:filming|shots|beats)\b/i;
/** Asking for the beats and shots by name: "the full script with shots", not "the complete script again". */
const FULL_EXPLICIT = /\bwith (?:the )?(?:filming|shots|beats|scenes)\b|\b(?:beats|shots|scenes) (?:back|again)\b/i;
const NEW_PIECE = /\b(new|another|different|second|next)\b[^.?!]{0,20}\b(script|reel|video|post|short|tiktok)\b/i;
const MAKE = /\b(write|make|create|draft|give me|i need|i want|help me|pitch|film|shoot|record)\b[^.?!]{0,60}\b(script|reel|video|short|tiktok|post|ad|pitch|caption|hooks?)\b/i;
/** Lists of ideas and plans for a week aren't one script: the plan and calendar rules answer those. */
const NOT_ONE_PIECE = /\bideas?\b|\b(?:week|weekly|calendar|schedule|month)\b/i;
const REVISE = /\b(make it|change|more|less|shorter|longer|tighter|instead|rather|add|remove|cut|drop|replace|swap|use|keep|start with|open with|end with|the hook|hook should|angle|tone|storytell\w*|story|rewrite|revise|redo|again|but|also|focus|mention|include|explain|clarify|not|don'?t|no,|wrong|actually|should be|it'?s called|is called|walkthrough|onboarding|feature)\b/i;
const RESEARCH = /\b(what'?s working|research|examples?|competitors?|trending|what are others|what do others|niche)\b/i;

/**
 * What a message asks for, read against the work so far. Deterministic, so a follow-up never waits for a
 * model call and never starts the research again by accident. `hasWork` is true when SOCIA has written
 * something in this chat (a brief exists or a draft was returned).
 */
export function readTurn(text: string, opts: { hasWork: boolean; brief?: CreativeBrief | null }): { turn: Turn; deliverable: Deliverable } {
  const t = text.trim();
  const current = opts.brief?.output ?? "full_script";
  const fmt: Deliverable | null = SPOKEN.test(t) ? "spoken_lines" : FILMING.test(t) ? "filming_guide" : CAPTION.test(t) ? "caption" : HOOKS.test(t) ? "hooks" : FULL.test(t) ? "full_script" : null;
  if (!opts.hasWork) {
    if (fmt) return { turn: "new", deliverable: fmt };
    if (MAKE.test(t) && !NOT_ONE_PIECE.test(t)) return { turn: "new", deliverable: "full_script" };
    return { turn: RESEARCH.test(t) ? "new" : "question", deliverable: RESEARCH.test(t) ? "research" : "answer" };
  }
  if (NEW_PIECE.test(t) && MAKE.test(t) && !NOT_ONE_PIECE.test(t)) return { turn: "new", deliverable: fmt ?? "full_script" };
  // "Complete" after a cut-off means the same piece whole, in the format it was in, not a switch back to beats.
  if (AGAIN.test(t)) return { turn: "again", deliverable: fmt && fmt !== "full_script" ? fmt : FULL_EXPLICIT.test(t) ? "full_script" : current };
  if (fmt && fmt !== current) return { turn: "format", deliverable: fmt };
  if (fmt) return { turn: "revise", deliverable: fmt };
  if (REVISE.test(t)) return { turn: "revise", deliverable: current };
  if (/\?\s*$/.test(t) && !MAKE.test(t)) return { turn: "question", deliverable: "answer" };
  return { turn: "revise", deliverable: current };
}

/**
 * The brief after this message: the model's update where it gave one, else the previous brief; the format
 * the person asked for; and their correction kept in their own words. A new piece starts a new brief.
 */
export function nextBrief(prev: CreativeBrief | null, fromModel: CreativeBrief | null, turn: Turn, deliverable: Deliverable, userText: string): CreativeBrief | null {
  if (turn === "question") return prev;
  const base = turn === "new" ? (fromModel ?? { ...EMPTY_BRIEF }) : { ...EMPTY_BRIEF, ...(prev ?? {}), ...stripEmpty(fromModel) };
  // Requirements set before stay unless the model's update named their replacement.
  const merged: CreativeBrief = {
    ...base,
    mustInclude: [...new Set([...(turn === "new" ? [] : prev?.mustInclude ?? []), ...(fromModel?.mustInclude ?? [])])].slice(-15),
    output: deliverable === "research" || deliverable === "answer" ? (prev?.output ?? "full_script") : deliverable,
    corrections: turn === "revise" || turn === "format"
      ? [...(prev?.corrections ?? []), userText.replace(/\s+/g, " ").trim().slice(0, 300)].filter(Boolean).slice(-8)
      : turn === "new" ? [] : prev?.corrections ?? [],
  };
  return sanitizeBrief(merged) ?? (prev ? { ...prev, output: merged.output } : null);
}

function stripEmpty(b: CreativeBrief | null): Partial<CreativeBrief> {
  if (!b) return {};
  return Object.fromEntries(Object.entries(b).filter(([k, v]) => k !== "corrections" && k !== "output" && (Array.isArray(v) ? v.length > 0 : Boolean(v)))) as Partial<CreativeBrief>;
}

/** The brief as a prompt block. */
export function briefBlock(b: CreativeBrief | null): string {
  if (!b) return "";
  const rows: [string, string][] = [
    ["Content", b.contentType], ["Topic", b.topic], ["Audience", b.audience], ["Platform", b.platform], ["Goal", b.goal],
    ["Hook (use exactly)", b.hook], ["Length", b.duration], ["Tone", b.tone], ["Structure", b.structure], ["Call to action", b.cta],
  ];
  return [
    "# Creative brief for this chat (kept by SOCIA across turns)",
    "Everything here stays in force unless the latest message changes it; the latest message wins where they differ.",
    ...rows.filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`),
    b.mustInclude.length ? `- Must include: ${b.mustInclude.join("; ")}` : "",
    b.corrections.length ? `- The person's corrections so far (all still apply):\n${b.corrections.map((c) => `  - "${c}"`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

// ---- what to write, per deliverable -------------------------------------------------------------

/** The output rule for this turn's deliverable: only what was asked for. */
export function formatRule(d: Deliverable, turn: Turn): string {
  const lead = turn === "revise" || turn === "format"
    ? `This message changes the current piece. "text" is at most one short sentence saying what changed (when it corrects you, acknowledge it in a few words, never explain why the last answer was wrong). Then the whole revised deliverable in "draft", complete, never only the changed part. Keep every requirement in the brief.`
    : turn === "again"
      ? `The person wants the current piece again, complete. Write all of it in "draft", from the first line to the last, with the brief's latest requirements. "text" is one short sentence.`
      : "";
  const only = `Write nothing else: no research, no examples, no caption, no sound, no editing notes, no testing advice and no recommendations unless the person asked for them in this chat. research stays empty (approach "", examples [], why "", test "", steps []); observed, derived, interpretation and recommendation stay empty.`;
  const rule: Record<Deliverable, string> = {
    full_script: `Deliverable: the full video script in "draft" (kind script). Numbered beats, each with its time ("1. 0 to 4s"), then "Film:", "On screen:", "Say:" and "Transition:" (the last beat has no transition). After the beats, "Your lines:" with every Say line in order as one block. Caption, sound, filming notes and editing notes only when the person asked for them. ${only}`,
    spoken_lines: `Deliverable: only the spoken words, complete, in "draft" (kind script, title "Your lines"): every line the person says, in order, as plain paragraphs. No beat numbers, no times, no "Say:" labels, no film, on-screen, transition, caption or any other notes. ${only}`,
    filming_guide: `Deliverable: the filming guide for the current script in "draft" (kind other, title "Filming guide"): shot by shot, where to stand, what the camera does, what is in frame first, and what to have ready. Nothing else. ${only}`,
    caption: `Deliverable: the caption in "draft" (kind caption), ready to post, with at most 5 hashtags. ${only}`,
    hooks: `Deliverable: hook options in "draft" (kind hooks), one per line, each the actual first words said or shown. ${only}`,
    research: `Deliverable: what the research shows, in "research", grounded only in the examples listed. Write a script only if the person asked for one.`,
    answer: `Deliverable: a direct answer in "text" (1 to 3 sentences). No draft unless the person asked for something to be written.`,
  };
  return [lead, rule[d]].filter(Boolean).join("\n");
}

// ---- checking an answer ---------------------------------------------------------------------------

const BEAT_LINE = /^\s*(?:\d+\.\s*\d+\s*(?:to|-)\s*\d+\s*s\b.*|(?:Film|On screen|Transition|Caption|Sound|Filming notes|Editing|Say)\s*:.*)$/im;

/** The spoken lines in a script: its "Your lines" block, else every "Say:" line in order. Pure. */
export function spokenLines(body: string): string {
  const block = /(?:^|\n)\s*Your lines\s*:\s*\n?([\s\S]+?)(?:\n\s*\n(?:[A-Z][A-Za-z ]{2,20}:)|$)/.exec(body)?.[1]?.trim();
  if (block) return block;
  const says = [...body.matchAll(/^\s*Say\s*:\s*(.+)$/gim)].map((m) => m[1].trim().replace(/^["“]|["”]$/g, "")).filter((s) => s && !/^\(?none\)?$/i.test(s));
  return says.join("\n\n");
}

/** Seconds the spoken words take at a natural Reel pace (about 2.5 words a second); null without spoken words. Pure. */
export function spokenSeconds(body: string, kind: Deliverable): number | null {
  const words = (kind === "spoken_lines" ? body : spokenLines(body)).split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return words ? Math.max(1, Math.round(words / 2.5)) : null;
}

/** Whether text ends like a finished piece rather than mid-sentence. Pure. */
export function endsComplete(body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  const last = t.split("\n").filter((l) => l.trim()).pop() ?? "";
  if (/[.!?…"”')\]]\s*$/.test(last) || /#\w+\s*$/.test(last)) return true;
  // A line that stops on a joining word, or a label with nothing after it, was cut off. (Text alone can't
  // catch a cut in the middle of a word: the route checks the model's stop reason for that.)
  return !/\b(?:and|the|a|an|to|of|with|your|for|or|but|in|on|at|is|are|that|so)\s*$/i.test(last) && !/:\s*$/.test(last);
}

export type Problem =
  | { kind: "missing" }                    // a deliverable was asked for and none came
  | { kind: "incomplete" }                 // it stops mid-sentence
  | { kind: "claim"; detail: string }      // it states something false about SOCIA
  | { kind: "format"; detail: string };    // it isn't the format asked for, and couldn't be fixed here

export type Checked = { body: string; seconds: number | null; problems: Problem[]; fixed: string[] };

/**
 * Checks a draft against what was asked for, fixing what can be fixed without a model call:
 * spoken lines that came with beat labels are reduced to the lines; a full script without its
 * "Your lines" block gets one; claims SOCIA knows to be false are reported. Pure.
 */
export function checkDraft(body: string, d: Deliverable, findClaims: (text: string) => string[] = () => []): Checked {
  const fixed: string[] = [];
  const problems: Problem[] = [];
  let out = body.replace(/\r/g, "").trim();
  const wantsDraft = d !== "research" && d !== "answer";
  if (wantsDraft && !out) return { body: out, seconds: null, problems: [{ kind: "missing" }], fixed };
  if (d === "spoken_lines" && BEAT_LINE.test(out)) {
    const lines = spokenLines(out);
    if (lines) { out = lines; fixed.push("kept only the spoken lines"); }
    else problems.push({ kind: "format", detail: "The person asked for only the spoken lines, but the draft has beats and notes." });
  }
  if (d === "full_script" && /^\s*Say\s*:/im.test(out) && !/(?:^|\n)\s*Your lines\s*:/i.test(out)) {
    const lines = spokenLines(out);
    if (lines) { out = `${out}\n\nYour lines:\n${lines}`; fixed.push("added the Your lines block"); }
  }
  if (out && !endsComplete(out)) problems.push({ kind: "incomplete" });
  for (const detail of findClaims(out)) problems.push({ kind: "claim", detail });
  return { body: out, seconds: out ? spokenSeconds(out, d) : null, problems, fixed };
}

/** The instruction for the one repair pass, when a check found something it couldn't fix itself. */
export function repairNote(problems: Problem[], d: Deliverable): string {
  const lines = problems.map((p) =>
    p.kind === "missing" ? `- The answer had no ${d === "spoken_lines" ? "spoken lines" : "draft"}, but the person asked for one. Write it in full.`
      : p.kind === "incomplete" ? "- The draft stopped mid-sentence. Write the whole deliverable again, complete to the last line."
        : p.kind === "claim" ? `- It describes SOCIA wrongly: ${p.detail} Use only what "SOCIA's real features" says.`
          : `- ${p.detail}`);
  return `Your last answer to this message had problems. Answer the same message again, fixing them, and keep everything else the same:\n${lines.join("\n")}`;
}
