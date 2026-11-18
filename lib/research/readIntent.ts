// The model's read of a request (lib/research/intent.ts), on the fast model
// with low effort and a short time limit. Anything that goes wrong falls back
// to the words-only guess, so Ask still answers; the research is just coarser.

import { anthropic, effortFor, modelFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { INTENT_PROMPT, INTENT_SCHEMA, guessIntent, sanitizeIntent, type ResearchIntent } from "./intent";

const LIMIT_MS = 7000;

export async function readIntent(opts: { ownerId: string; question: string; earlier?: string; page: string; brand: string }): Promise<{ intent: ResearchIntent; from: "model" | "guess" }> {
  const guess = guessIntent(opts.question, { page: opts.page, niche: null });
  const model = modelFor("ask");
  try {
    const call = anthropic.messages.create({
      model,
      max_tokens: 400,
      system: INTENT_PROMPT,
      output_config: { format: { type: "json_schema", schema: INTENT_SCHEMA }, ...effortFor(model, "low") },
      messages: [{ role: "user", content: `Brand: ${opts.brand || "unknown"}\nPage: ${opts.page}\n${opts.earlier ? `Earlier in the chat: ${opts.earlier.slice(0, 600)}\n` : ""}Request: ${opts.question.slice(0, 1500)}` }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    let t: ReturnType<typeof setTimeout> | undefined;
    const res = await Promise.race([call, new Promise<null>((r) => { t = setTimeout(() => r(null), LIMIT_MS); })]).finally(() => clearTimeout(t));
    if (!res) return { intent: guess, from: "guess" };
    recordAiUsage(opts.ownerId, "ask", res);
    const block = (res as { content: { type: string; text?: string }[] }).content.find((b) => b.type === "text");
    const parsed = block?.text ? JSON.parse(block.text) : null;
    return { intent: sanitizeIntent(parsed, guess), from: parsed ? "model" : "guess" };
  } catch {
    return { intent: guess, from: "guess" };
  }
}
