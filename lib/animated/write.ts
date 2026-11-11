// Writes the scenes of an animated video ("Make it with AI", animated style)
// from one content plan post and the brand profile. The model only writes
// words and numbers; lib/animated/spec.ts cleans them (no invented numbers,
// short lines; comparison values not in the plan are marked "Example numbers")
// and components/animated/AnimatedComposition.tsx draws them. Server only.
import { anthropic, MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { getProfile } from "@/lib/profile";
import { brandWorkspace, type Ctx } from "@/lib/context";
import { brandLine } from "@/lib/aiStudio/captions";
import { ACCENTS, cleanSpec, MAX_SCENES, type AnimatedSpec } from "./spec";

/** The plan post the video is about: what the plan wrote, nothing more. */
export type AnimatedSource = { title?: string; hook: string; concept: string; direction?: string; purpose?: string; audience?: string };

const HEADLINE = {
  type: "object", additionalProperties: false, required: ["lines", "key"],
  properties: { lines: { type: "array", items: { type: "string" } }, key: { type: "string" } },
} as const;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["format", "theme", "accent", "compare", "scenes", "caption", "hashtags"],
  properties: {
    format: { type: "string", enum: ["compare", "words"] },
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
  },
} as const;

const SYSTEM = `You turn one planned social media post into a short animated vertical video drawn in code: no footage, no people, no photos. There are two formats.

FORMAT "compare" (prefer it whenever it honestly fits): 2 to 4 options side by side, measured on ONE number that counts up in every column at once (time, price, steps, minutes, grams, cups, kilometres, days). Each column stops at its value, turns green (tone "win"), red ("lose") or grey ("neutral") and gets a stamp of one or two words (for example SOUR, BALANCED, BITTER; TOO SLOW; BEST VALUE). It fits tips, mistakes, myths, "this vs that", options, before and after told as numbers, and anything where choosing differently changes a number.
- hook: the opening headline, two short lines (at most 7 words each) that state the surprising setup, e.g. "Same beans. Same machine." / "Three different coffees." "key" is one or two words copied exactly from the second line to set in italics.
- turn: the second headline (at 2 seconds), naming the one thing that differs, e.g. "Only one thing changed:" / "the grind."
- close: the last headline, the lesson in two lines, e.g. "Grind sets the time." / "Time sets the taste."
- setup: one short line under the headline saying what was kept the same, or an empty string.
- format "clock" when the number is a duration in seconds (shown as m:ss; give values in seconds), otherwise "number" with a short "unit" ("g", "min", "$", "steps") or an empty unit.
- columns: label of at most 3 words, value (a plain number), stamp, tone. Order them as the viewer should read them, left to right.
- note: one line shown at the end, e.g. "Balanced is 25 to 30 seconds", or an empty string. question: the comment question at the end, at most 8 words, e.g. "Which one did you get today?"
- Values: use numbers written in the post or the brand details whenever they exist. Otherwise only well-established general facts or clearly typical examples; never results, sales, ratings or anything about the brand's own performance. When a value is not written in the post the video says "Example numbers" by itself.
- Headlines, setup, note and question must not contain any number that isn't written in the post or brand details.

FORMAT "words": a few scenes of words on screen, each one idea a viewer reads in two or three seconds. Always write these scenes too, even when you choose "compare": they are the fallback.
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
- When you choose "words", fill compare with empty strings, an empty columns list and format "number".
- accent: one of the listed colours, the one closest to the brand's feel.
- caption: one or two sentences in the brand's voice for the post itself. hashtags: 3 to 5, without the # sign.`;

export async function writeAnimatedSpec(ctx: Ctx, post: AnimatedSource): Promise<AnimatedSpec> {
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const brand = brandLine(profile);
  const lines = [
    post.title ? `Title: ${post.title}` : "",
    `Hook: ${post.hook}`,
    `Concept: ${post.concept}`,
    post.direction ? `Direction: ${post.direction}` : "",
    post.purpose ? `Purpose: ${post.purpose}` : "",
    post.audience ? `For: ${post.audience}` : "",
  ].filter(Boolean).map((l) => l.slice(0, 600));
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 6000, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(MODEL, "medium") },
    messages: [{ role: "user", content: `# Brand\n${brand}\n\n# The planned post\n${lines.join("\n")}\n\nWrite the video's scenes.` }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(ctx.ownerId, "animated_script", res);
  if (res.stop_reason === "refusal") throw Object.assign(new Error("SOCIA declined this one. Try a different post."), { status: 422 });
  const block = res.content.find((b: { type: string }) => b.type === "text");
  const text = block && "text" in block ? (block as { text: string }).text : "";
  let raw: unknown = null;
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
  const spec = cleanSpec(raw, `${brand}\n${lines.join("\n")}`, { signoff: profile?.brand_name ?? null });
  if (!spec) throw Object.assign(new Error("SOCIA's video came back incomplete. Try again."), { status: 502 });
  return spec;
}
