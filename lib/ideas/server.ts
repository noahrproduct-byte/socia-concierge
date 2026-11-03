// Writing video ideas from what SOCIA holds about the brand: its own posts and
// their real results, what it said yes and no to in past plans, the formats
// leading in its niche, and its saved brand voice. Server only.
import { anthropic, MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { brandContext } from "@/lib/prompt";
import { getProfile } from "@/lib/profile";
import { getIgSnapshot } from "@/lib/instagramSync";
import { loadEvidence } from "@/lib/planEvidence";
import { competitorScopeId } from "@/lib/workspaces";
import { brandWorkspace, type Ctx } from "@/lib/context";
import { cleanIdeas, IDEA_COUNT, IDEA_STYLES, IDEAS_SCHEMA, type IdeaSet, type IdeaStyle } from "./videoIdeas";

const SYSTEM = `You are SOCIA's creative director for one small business or creator. You write video ideas they can actually make this week, and for each one you decide how it is best filmed, not only what is said.
Rules you never break:
- Every idea follows the account's own theme: the subjects, setting, people, tone and formats that show up in its posts. "themeFit" names the specific posts or patterns from the evidence it follows (a post's opening words and its result against the account's median). When the evidence is thin, say so plainly and follow the niche and brand voice instead. Never invent a result.
- "evidence" is how much the account's own results back the idea, and "themeFit" must not claim more: "strong" only when similar posts did clearly better than the account's median (about one and a half times or more) consistently: two or more did, and most similar posts did, so the pattern is the reason. "promising" when one similar post did better, when the margin is small (18 against a median of 16 is promising, not strong), or when results are mixed (some similar posts well above the median and others at or below it). "untested" when nothing similar has been posted.
- The treatment follows the concept, never a default. A relatable situation or a joke is acted out, so the viewer sees the moment instead of hearing it described: "sketch" (people play the scene) or "pov" (the camera is the viewer's eyes). A how-to is a "demo" with close-ups. News, an opinion or a story only the person can tell is "talking" to the camera. The work, the place and the people is "behind_scenes". Animation style is always "animation". Face to camera allows talking, sketch or pov; in person allows sketch, pov, demo or behind_scenes.
- The first shot is the hook: within the first two seconds it shows the conflict, the surprise or the result, or says the line that makes the point. Never open with a setup that explains what is coming ("every gym has one", "let's talk about", "here's why"). For a sketch or pov, open mid-moment and let the on-screen text name the situation in a few words.
- Length follows the treatment: a sketch, pov or joke 12 to 20 seconds; talking 15 to 35; a demo up to 45.
- Not every video sells. About half of the ideas are pure niche content: a joke, a moment or a tip the audience would share for its own sake, with no mention of the business or product at all (the account name on the post does that work). In the others, the business or product comes in once, late, in one short line a person would actually say, never a pitch, and each of those lines is different. Only say it does what the evidence or brand profile says it does; if it is still being built, say so and never show it working.
- One call to action that fits the idea (tag someone, comment, save), never two.
- Only the styles asked for. Face to camera: the person talks to the camera; "script" is every word they say, in the brand's voice, short spoken sentences. In person: real scenes filmed at their place (people, product, process, behind the scenes); "say" is what is said in a shot, if anything. Animation: nothing is filmed; each shot describes the frame (text, shapes, colours, motion), and "script" is empty unless there is a voiceover.
- A shot list that covers the whole video: 3 to 8 shots, "from" and "to" in seconds, back to back from 0 to lengthSec. lengthSec between 7 and 60.
- On-screen text is a few plain words the way a person types in the Instagram or TikTok text tool: sentence case or lowercase, no hashtags, no dashes, at most one emoji, no marketing words (unlock, elevate, ultimate, journey, mouthwatering, game-changer). Use "" for a shot without text.
- Never invent facts about the business: no prices, hours, awards, ingredients or claims that aren't in the evidence. Never predict views, reach or virality.
- "needs": what it takes to make it (people, place, props, roughly how long), honest and small.
- "caption": one or two sentences in the brand's voice plus at most 3 hashtags.
- Plain text everywhere, no markdown, no em dashes.`;

const STYLE_NOTE: Record<IdeaStyle, string> = {
  face: "face to camera (the person talks to the camera)",
  in_person: "in person (filmed at their place, no one has to talk to the camera)",
  animation: "animation (nothing filmed: text, shapes and motion)",
};

export async function writeIdeas(ctx: Ctx, args: { styles: IdeaStyle[]; about: string | null; now?: Date }): Promise<IdeaSet> {
  const wsId = ctx.workspace?.id ?? null;
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const snap = await getIgSnapshot(ctx.client, ctx.ownerId, wsId).catch(() => null);
  const evidence = await loadEvidence(ctx.client, ctx.ownerId, snap, await competitorScopeId(ctx.client, ctx.workspace?.id).catch(() => null), { strategy: profile?.brand_detail?.strategy ?? null }).catch(() => null);
  const styles = args.styles.length ? args.styles : IDEA_STYLES.map((s) => s.id);
  const brand = [
    `Account: ${profile?.niche ?? "niche not set"}${profile?.brand_detail?.location ? `, ${profile.brand_detail.location}` : ""}${profile?.goals ? `; goal: ${profile.goals}` : ""}.`,
    brandContext(profile?.brand_detail) || "",
  ].filter(Boolean).join("\n");
  const ev = evidence ? [evidence.postsBlock, evidence.formatsBlock, evidence.decisionsBlock, evidence.outcomesBlock].filter(Boolean).join("\n\n") : "";
  const task = `Write ${IDEA_COUNT} video ideas in these styles, spread across them: ${styles.map((s) => STYLE_NOTE[s]).join("; ")}.${args.about ? `\nThe person wants them to be about: ${args.about}` : ""}`;

  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 10000, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: IDEAS_SCHEMA }, ...effortFor(MODEL) },
    messages: [{ role: "user", content: [brand, ev ? `# What SOCIA holds about this account\n${ev}` : "# What SOCIA holds about this account\nNo synced posts yet.", `# Task\n${task}`].join("\n\n") }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(ctx.ownerId, "video_ideas", res);
  if (res.stop_reason === "refusal") throw Object.assign(new Error("SOCIA declined this one. Try a different topic."), { status: 422 });
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "";
  let raw: unknown = null;
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
  const now = args.now ?? new Date();
  let n = 0;
  const stamp = now.getTime().toString(36);
  const ideas = cleanIdeas(raw, styles, () => `v${stamp}${n++}`);
  if (!ideas.length) throw Object.assign(new Error("SOCIA's ideas came back incomplete. Try again."), { status: 502 });
  return { at: now.toISOString(), styles, about: args.about, ideas };
}
