// Writes the scenes of an animated video ("Make it with AI", animated style)
// from one content plan post and the brand profile. The model only writes
// words and numbers; lib/animated/spec.ts cleans them (no invented numbers,
// short lines; comparison values not in the plan are marked "Example numbers")
// and components/animated/AnimatedComposition.tsx draws them. Server only.
import { anthropic, MODEL, FAST_MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { getProfile } from "@/lib/profile";
import { brandWorkspace, type Ctx } from "@/lib/context";
import { brandLine } from "@/lib/aiStudio/captions";
import { ACCENTS, cleanSpec, MAX_SCENES, type AnimatedSpec } from "./spec";
import { lookFromStyle } from "./look";
import { pitchFromDetail, pitchLines } from "@/lib/brandPitch";
import { readSavedStyle, type VideoStyle } from "@/lib/videoStyle";

/** The plan post the video is about: what the plan wrote, nothing more. */
export type AnimatedSource = { title?: string; hook: string; concept: string; direction?: string; purpose?: string; audience?: string };

const HEADLINE = {
  type: "object", additionalProperties: false, required: ["lines", "key"],
  properties: { lines: { type: "array", items: { type: "string" } }, key: { type: "string" } },
} as const;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["format", "theme", "accent", "compare", "counter", "scenes", "caption", "hashtags", "cta"],
  properties: {
    format: { type: "string", enum: ["compare", "counter", "words"] },
    compare: {
      type: "object", additionalProperties: false,
      required: ["hook", "turn", "close", "setup", "format", "unit", "columns", "note", "question"],
      properties: {
        hook: HEADLINE, turn: HEADLINE, close: HEADLINE,
        setup: { type: "string" },
        format: { type: "string", enum: ["clock", "number"] },
        unit: { type: "string" },
        columns: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["label", "value", "stamp", "tone"],
            properties: { label: { type: "string" }, value: { type: "number" }, stamp: { type: "string" }, tone: { type: "string", enum: ["win", "lose", "neutral"] } },
          },
        },
        note: { type: "string" },
        question: { type: "string" },
      },
    },
    counter: {
      type: "object", additionalProperties: false,
      required: ["hook", "close", "setup", "measure", "format", "unit", "rounds", "note", "question"],
      properties: {
        hook: HEADLINE, close: HEADLINE,
        setup: { type: "string" }, measure: { type: "string" },
        format: { type: "string", enum: ["clock", "number"] },
        unit: { type: "string" },
        rounds: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["label", "title", "value", "result"],
            properties: { label: { type: "string" }, title: { type: "string" }, value: { type: "number" }, result: HEADLINE },
          },
        },
        note: { type: "string" },
        question: { type: "string" },
      },
    },
    theme: { type: "string", enum: ["ink", "light", "accent"] },
    accent: { type: "string", enum: [...ACCENTS] },
    scenes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["type", "text", "emphasis", "title", "items", "sub"],
        properties: {
          type: { type: "string", enum: ["hook", "point", "list", "quote", "cta"] },
          text: { type: "string" }, emphasis: { type: "string" }, title: { type: "string" },
          items: { type: "array", items: { type: "string" } }, sub: { type: "string" },
        },
      },
    },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    cta: { type: "object", additionalProperties: false, required: ["line", "action"], properties: { line: { type: "string" }, action: { type: "string" } } },
  },
} as const;

const SYSTEM = `You turn one planned social media post into a short animated vertical video drawn in code: no footage, no people, no photos. There are three formats. Prefer "compare" or "counter" over "words" whenever one of them honestly fits.

THE POINT, before anything else. The video argues ONE point that moves the brand's audience toward the owner's main goal (see "What the brand sells and wants"):
- The hook names a problem or a want the audience really has, in their words. The middle shows it with the format. The close headline is the lesson, and it points at what the brand does about it.
- When the brand sells or makes something, the video names the brand once, plainly, as what helps with that problem. Say only what it does, from "What it is". Never claim a result it gets: no numbers, no "faster", "better" or "more" about the brand's product.
- cta: when the main goal is people doing something (booking, ordering, signing up, joining a waitlist) and the brand sells something, fill it: "line" is one sentence, at most 14 words, that names the brand and what it does for this problem; "action" is the account's own call to action, in its own words when they are given (for example "DM to enter the waitlist"), at most 7 words. Otherwise leave both empty and end on the comment question.
- A fun fact or general know-how with no point for this audience is not acceptable.

FORMAT "compare": 2 to 4 options side by side, measured on ONE number that counts up in every column at once (time, price, steps, minutes, grams, cups, kilometres, days). Each column stops at its value, turns green (tone "win"), red ("lose") or grey ("neutral") and gets a stamp of one or two words (for example SOUR, BALANCED, BITTER; TOO SLOW; BEST VALUE). It fits tips, mistakes, myths, "this vs that", options, before and after told as numbers, and anything where choosing differently changes a number.
- hook: the opening headline, two short lines (at most 7 words each) that state the surprising setup, e.g. "Same beans. Same machine." / "Three different coffees." "key" is one or two words copied exactly from the second line to set in italics.
- turn: the second headline (at 2 seconds), naming the one thing that differs, e.g. "Only one thing changed:" / "the grind."
- close: the last headline, the lesson in two lines, e.g. "Grind sets the time." / "Time sets the taste."
- setup: one short line under the headline saying what was kept the same, or an empty string.
- format "clock" when the number is a duration in seconds (shown as m:ss; give values in seconds), otherwise "number" with a short "unit" ("g", "min", "$", "steps") or an empty unit.
- columns: label of at most 3 words, value (a plain number), stamp, tone. Order them as the viewer should read them, left to right.
- note: one line shown at the end, e.g. "Balanced is 25 to 30 seconds", or an empty string. question: the comment question at the end, at most 8 words, e.g. "Which one did you get today?"
- Values: use numbers written in the post or the brand details whenever they exist. Otherwise only well-established general facts or clearly typical examples; never results, sales, ratings or anything about the brand's own performance. When a value is not written in the post the video says "Example numbers" by itself.
- Headlines, setup, note and question must not contain any number that isn't written in the post or brand details.

FORMAT "counter": one big number counting up in 2 to 4 rounds that escalate, each round changing one thing (bigger, longer, more often, later). It fits growth over time (week 1, week 4, week 12), the same thing at a bigger scale, "how many X in Y", habits that add up, and surprising totals. Example: rounds "One coffee a day" 1, "For a month" 30, "For a year" 365, measure "Cups".
- hook and close: two-line headlines like in "compare". hook states the setup; close is the lesson.
- rounds: label (at most 3 words, e.g. "Round 1", "Week 4", "Year 1"), title (at most 5 words, what changed), value (the number this round ends on), result (the headline shown after this round, two short lines; it may use this round's value, no other numbers). Values should grow round to round.
- measure: what the big number counts, at most 3 words ("Cups", "Collisions", "Minutes saved"). format and unit as in "compare".
- setup, note, question: as in "compare". The same rules for values and numbers apply.

FORMAT "words": a few scenes of words on screen, each one idea a viewer reads in two or three seconds. Always write these scenes too, even when you choose "compare" or "counter": they are the fallback.
Scene types:
- hook: the first scene, the line that stops the scroll. At most 9 words. Usually the post's hook, tightened.
- point: one statement, at most 16 words.
- list: a title of at most 8 words and 2 to 4 items of at most 7 words each. Never number the items yourself.
- quote: a line said in the brand's voice, at most 22 words. Never attribute it to a customer or a real person.
- cta: the last scene, what to do next (follow, save, visit, message), at most 8 words, with an optional "sub" line of at most 10 words.
Rules you never break:
- 3 to ${MAX_SCENES} scenes, hook first, cta last.
- In scenes, use only facts in the post and the brand details. Never write a number, price, percentage, time, rating, award or result that isn't written there. If the post has no numbers, write none.
- "emphasis" is one to three words copied exactly from that scene's text, the words to highlight. Use an empty string when nothing should stand out, and for list, quote and cta.
- Fill the fields a type doesn't use with an empty string or an empty list.
- Sentence case, plain words, no hashtags or emoji on screen, no em dashes, no marketing clichés.
- theme: "ink" (dark), "light" or "accent" (the accent colour as background; words format only). Pick what suits the brand; "ink" when unsure.
- Fill the template you don't use (compare or counter) with empty strings, empty lists and format "number".
- accent: one of the listed colours, the one closest to the brand's feel.
- caption: one or two sentences in the brand's voice for the post itself. hashtags: 3 to 5, without the # sign.`;

/** The account's own videos, for the writer: what they are, how they're carried and how they read, and how competitors build theirs. */
function styleLines(s: VideoStyle): string {
  const id = s.identity;
  const kinds = id.formats.map((f) => `- ${f.name}: ${f.look}${f.spine ? ` Carried by ${f.spine}.` : ""}`).join("\n");
  const st = s.structure;
  return [
    "",
    "# The account's own videos (follow these; the video is drawn in the account's colours, type and stage)",
    kinds ? `Its kinds of video:\n${kinds}` : "",
    id.characters ? `Its character: ${id.characters}` : "",
    id.stage ? `Its stage: ${id.stage}` : "",
    id.type ? `How its words read: ${id.type}` : "",
    st.hooks.length || st.spines.length ? `How its competitors build theirs (structure only, never their look or words): ${[...st.hooks, ...st.spines].join("; ")}` : "",
    "Pick the template closest to one of the account's own kinds: a big stat, a counter, attempts, rounds or a progress bar is \"counter\"; a this-versus-that is \"compare\". Write it the way that kind reads: when its videos tell a first-person story, the rounds are the story's beats (\"Session 1\", \"Week 6\") and the headlines are short and punchy, at most 5 words a line. Keep the subject inside the account's world: its character and stage are drawn for you, so write what the character does and what changes, never describe the drawing.",
    "How it is drawn in this look: a comparison is the stage split into lanes, one character per option, each going up as its number counts and topping out when it stops; a counter is a big number with the character going up the stage and a progress line. There are no bars, rings or charts on screen, so never mention a bar, a column, a chart or a ring in any headline, note or question.",
    "",
  ].filter((l, i, a) => l || a[i - 1]).join("\n");
}

const REVIEW_SCHEMA = {
  type: "object", additionalProperties: false, required: ["passed", "problems"],
  properties: { passed: { type: "boolean" }, problems: { type: "array", items: { type: "string" } } },
} as const;

const REVIEW_SYSTEM = `You check the words of a short animated social video before its owner sees it. You get what the brand is and wants, the planned post, and every line the viewer will read, in order. Answer passed only when ALL of these hold:
1. It makes one clear point a person in the brand's audience would get and care about.
2. That point moves them toward the owner's main goal.
3. When the brand sells or makes something, the brand is named once and the video says plainly what it does for this problem.
4. Nothing claims a result for the brand's product (no numbers or "faster/better" about it), and no number is presented as fact unless it is labelled as an example.
5. The words match what is on screen: a comparison is shown as options side by side, a counter as one number going up; nothing mentions bars, charts or rings.
problems: each failure as one short sentence saying what to change. Empty when passed.`;

/** Every line the viewer reads, in order, for the check. Pure. */
export function specWords(spec: AnimatedSpec): string {
  const h = (x: { lines: [string, string] }) => x.lines.join(" / ");
  const out: string[] = [];
  if (spec.compare) {
    const c = spec.compare;
    out.push(`Comparison. Headlines: ${h(c.hook)} | ${h(c.turn)} | ${h(c.close)}`, `Setup: ${c.setup}`, `Options: ${c.columns.map((x) => `${x.label} ${x.value} ${c.unit} (${x.stamp})`).join("; ")}${c.illustrative ? " [labelled Example numbers]" : ""}`, `Note: ${c.note}`);
  } else if (spec.counter) {
    const c = spec.counter;
    out.push(`Counter of ${c.measure}. Headlines: ${h(c.hook)} | ${c.rounds.map((r) => `${r.title} ${r.value}: ${h(r.result)}`).join(" | ")} | ${h(c.close)}${c.illustrative ? " [labelled Example numbers]" : ""}`, `Note: ${c.note}`);
  } else {
    for (const sc of spec.scenes) out.push(sc.type === "list" ? `${sc.title}: ${sc.items.join("; ")}` : sc.type === "cta" ? `${sc.text} ${sc.sub ?? ""}` : sc.text);
  }
  out.push(spec.cta ? `Ending: ${spec.cta.line} / ${spec.cta.action}` : `Ending question: ${spec.compare?.question ?? spec.counter?.question ?? ""}`);
  return out.filter(Boolean).join("\n");
}

async function reviewSpec(ownerId: string, about: string, post: string, spec: AnimatedSpec): Promise<{ passed: boolean; problems: string[] }> {
  try {
    const res = await anthropic.messages.create({
      model: FAST_MODEL, max_tokens: 1200, system: REVIEW_SYSTEM,
      output_config: { format: { type: "json_schema", schema: REVIEW_SCHEMA }, ...effortFor(FAST_MODEL, "low") },
      messages: [{ role: "user", content: `# What the brand sells and wants\n${about}\n\n# The planned post\n${post}\n\n# The video's words\n${specWords(spec)}` }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    recordAiUsage(ownerId, "animated_review", res);
    const block = res.content.find((b: { type: string }) => b.type === "text");
    const raw = JSON.parse((block && "text" in block ? (block as { text: string }).text : "{}").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as { passed?: unknown; problems?: unknown };
    const problems = (Array.isArray(raw.problems) ? raw.problems : []).filter((x): x is string => typeof x === "string").map((x) => x.replace(/\s*[—–]\s*/g, ", ").slice(0, 200)).slice(0, 5);
    return { passed: raw.passed === true && !problems.length, problems };
  } catch {
    // A check that can't run never blocks the video; it just isn't marked as checked.
    return { passed: false, problems: [] };
  }
}

export async function writeAnimatedSpec(ctx: Ctx, post: AnimatedSource, opts: { change?: string; current?: AnimatedSpec | null } = {}): Promise<AnimatedSpec> {
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const brand = brandLine(profile);
  // The account's own video style (lib/videoStyle.ts): the video is drawn in it, and written like the account's own Reels.
  const style = readSavedStyle((profile?.brand_detail as { videoStyle?: unknown } | null | undefined)?.videoStyle);
  const own = style ? styleLines(style) : "";
  // What the brand sells and wants, so the video has a point (lib/brandPitch.ts).
  const pitch = pitchFromDetail(profile?.brand_detail, { name: profile?.brand_name, goals: profile?.goals });
  const about = pitchLines(pitch).join("\n") || "(not set)";
  const lines = [
    post.title ? `Title: ${post.title}` : "",
    `Hook: ${post.hook}`,
    `Concept: ${post.concept}`,
    post.direction ? `Direction: ${post.direction}` : "",
    post.purpose ? `Purpose: ${post.purpose}` : "",
    post.audience ? `For: ${post.audience}` : "",
  ].filter(Boolean).map((l) => l.slice(0, 600));
  const ask = opts.change
    ? `The owner saw this version:\n${opts.current ? specWords(opts.current) : "(not shown)"}\n\nThey asked for this change: "${opts.change}"\nWrite the whole video again with that change, keeping everything else that worked.`
    : "Write the video's scenes.";
  const write = async (extra: string) => {
    const res = await anthropic.messages.create({
      model: MODEL, max_tokens: 6000, system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(MODEL, "medium") },
      messages: [{ role: "user", content: `# Brand\n${brand}\n\n# What the brand sells and wants\n${about}\n${own}\n# The planned post\n${lines.join("\n")}\n\n${ask}${extra}` }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    recordAiUsage(ctx.ownerId, "animated_script", res);
    if (res.stop_reason === "refusal") throw Object.assign(new Error("SOCIA declined this one. Try a different post."), { status: 422 });
    const block = res.content.find((b: { type: string }) => b.type === "text");
    const text = block && "text" in block ? (block as { text: string }).text : "";
    let raw: unknown = null;
    try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
    // Numbers the change asked for count as the owner's own.
    return cleanSpec(raw, `${brand}\n${about}\n${lines.join("\n")}\n${opts.change ?? ""}`, { signoff: profile?.brand_name ?? null });
  };
  let spec = await write("");
  if (!spec) throw Object.assign(new Error("SOCIA's video came back incomplete. Try again."), { status: 502 });
  // The meaning check: one rewrite with what's off, then the result as it is, said honestly.
  const postText = lines.join("\n");
  let review = await reviewSpec(ctx.ownerId, about, postText, spec);
  if (!review.passed && review.problems.length) {
    const again = await write(`\n\nA check of your first version found these problems. Fix every one:\n${review.problems.map((p) => `- ${p}`).join("\n")}`).catch(() => null);
    if (again) {
      spec = again;
      review = await reviewSpec(ctx.ownerId, about, postText, spec);
    }
  }
  spec = { ...spec, review };
  return { ...spec, look: lookFromStyle(style) };
}
