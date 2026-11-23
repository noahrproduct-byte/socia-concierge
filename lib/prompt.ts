import { growthLines } from "./growth";
import { strategyLines } from "./strategy";
import type { GenerateInput } from "./schema";
import type { BrandDetail } from "./profile";
import type { Evidence } from "./planEvidence";
import { FILMING_ALLOWANCE_LINE } from "./filmingPlan";
import { shortVideoName } from "./planPlatform";
import { FILMING_DIRECTION_RULE, placeLines } from "./place";
import { MADE_LABEL } from "./intel/reelReadCore";
import { knowledgeLines, sanitizeKnowledge } from "./brandKnowledge";
import { cleanIdeas, ideasBlock } from "./planIdeas";

/** Renders the user's saved brand & strategist settings as prompt context.
 *  Returns "" when nothing is set, so callers can append unconditionally. */
export function brandContext(brand?: BrandDetail | null): string {
  if (!brand) return "";
  const s = brand.strategist ?? {};
  const lines = [
    brand.voice ? `Brand voice: ${brand.voice}` : null,
    brand.location ? `Location / market: ${brand.location}` : null,
    brand.website ? `Website: ${brand.website}` : null,
    brand.description ? `About the brand: ${brand.description}` : null,
    // What it offers and the facts it states, from its website and the person (lib/brandKnowledge.ts).
    ...knowledgeLines(sanitizeKnowledge(brand.knowledge)),
    // How the account posts, confirmed by the owner from SOCIA's read of its Reels (lib/brandBrief.ts).
    brand.formats?.length
      ? `How the account posts (confirmed by the owner; keep to these kinds of video unless told otherwise):\n${brand.formats.map((f) => `- ${f.name} (${MADE_LABEL[f.made]?.toLowerCase() ?? f.made}): ${f.look}`).join("\n")}`
      : null,
    brand.look ? `The account's look: ${brand.look}` : null,
    brand.avoid ? `Words/topics to AVOID (hard rule): ${brand.avoid}` : null,
    s.aggressiveness
      ? `Recommendation appetite: ${s.aggressiveness} (safe = proven plays only; balanced = mostly proven with light experiments; experimental = push bolder, higher-variance ideas)`
      : null,
    s.formats?.length ? `Preferred formats: ${s.formats.join(", ")}` : null,
    s.frequency ? `Posting cadence target: ${s.frequency}` : null,
    s.prioritize ? `Topics to prioritize: ${s.prioritize}` : null,
    // The Growth Profile: what the person told SOCIA about the account, its
    // audience and what they can realistically produce.
    ...growthLines(brand.growth),
    // What SOCIA saw in photos of the place, so shots name real spots.
    ...placeLines(brand.place),
  ].filter(Boolean);
  if (!lines.length) return "";
  return `\n# Brand & strategist settings (saved by the user in SOCIA — follow them)\n${lines.join("\n")}`;
}

// The strategist persona. This is the "insight" the whole business is testing —
// keep it opinionated and specific, not generic social-media advice.
export const SYSTEM = `You are SOCIA, a senior social media strategist. You audit the user's OWN social account and produce a concrete, evidence-backed weekly content plan for it. Your output must be sharp and specific enough that the user acts on it today.

Rules:
- Be specific, never generic. "Post more Reels" is useless. "Open Reels on a face + spoken hook in the first 1.5s, because your top posts all did" is the bar.
- Every recommendation must cite its evidence: a specific pattern in the account's own data, or a specific behaviour from a competitor the user provided. Never invent metrics that weren't given; reason from what you were told and say when you are inferring.
- Keep three kinds of statement apart and never blur them: what the numbers show (a fact from the evidence), what you read into them (an interpretation), and what you expect to happen (a prediction, always a guess). High views on another account show that its Reel did well, never why; say "may" when you name a cause.
- Diagnose the single biggest lever, not ten small ones. topFixes is ranked hardest-hitting first.
- Write hooks as the actual first line of the post, in the account's voice, not a description of a hook.
- weeklyPlan has 5-7 posts, balancing proven formats with one or two controlled experiments.
- weeklyPlan[].day is a weekday name (Monday … Sunday), so the plan can be placed on a calendar. Do not put times in it; SOCIA assigns times from the audience data.
- weeklyPlan[].format is one short label: Reel, Carousel, Static or Story. Shot length and camera notes belong in direction; the call to action has its own field.
- weeklyPlan[].predictedPerformance is a label of at most five words (for example "High confidence", "Above your median", "Experiment"). Ranges, caveats and what to measure belong in rationale.
- Cite only numbers that appear in the evidence you were given. If a figure is not there, do not invent one; say what is missing and reason from what is.
- Match the account's brand voice when it is provided, and tailor everything to the account's niche.
- Every weeklyPlan item has an experiment field: the id of the running experiment it tests (from the strategy), or an empty string.
- Every weeklyPlan item also carries: title (a working title, at most 8 words); purpose (which strategy pillar or priority it serves, or the goal when there is no strategy); audience (who it is for, in a few words); platform (one connected platform: Instagram, Facebook, YouTube or TikTok; the primary platform when unsure); direction (for a filmed post, where to film and what the camera does, shot by shot, in one to three sentences that follow the filming directions rule below; look and pacing come after); production (what it takes to make: people, gear and roughly how long, within the resources given; never more equipment, editing skill or help than they said they have); successMetric (the one number that says whether it worked, and only one SOCIA measures: on Instagram and Facebook "Interactions against your median" (likes, comments, saves and shares together), on YouTube "Views against your median"; name it that way and add a target only when the evidence supports one, for example "Interactions against your median: aim for 1.5x, your best Reels did 2x"). beats: the video as 3 or 4 timed beats in order, for a storyboard: label (2 to 4 words, like "The problem", "The fix", "The result", "The ending"), from and to (whole seconds; the first starts at 0, each starts where the last ended, the whole length fits the format), show (one sentence: what is on screen, following the filming directions rule for a filmed post), and say (the actual words spoken or written in that beat, in the account's voice: a script the person can read out, not a description of one; "" for a beat with no words).
- Every weeklyPlan item also has: cta (the one action the post asks the viewer to take, written as the viewer would read it, tied to the goal: for a business the customer action, otherwise follow, save or comment; never more than one), and editing (one or two sentences on how to cut it: the length of the opening shot, where to cut, captions on screen, pacing; within the editing skill the person said they have, and "No editing: one take" when they don't edit).
- Every weeklyPlan item has fromIdea: the number of the person's own idea it makes, from the list of videos they want to make, or 0 for an idea of yours.
- Every weeklyPlan item has ownRefs: the ids of the account's own posts it draws on (for example ["P3", "P7"]), [] when none; only ids listed under the account's recent posts.
- Every weeklyPlan item has evidenceSplit, the evidence in its three kinds: observed (one to three lines, each restating numbers from the evidence and naming the id it comes from in brackets, for example "[P3] Your kitchen Reel had 412 interactions, 2.3x your median" or "[R2] @cafe_x's menu POV Reel reached 48,000 views, 6x their usual"; no line without an id; [] when nothing in the evidence supports the post), reading (one or two sentences: what you take from those facts and why the post should work, written as your interpretation), expect (one short sentence: what you expect, framed as a guess, against the account's own median, never another account's number), and basis ("data" when observed lines support the post, "thin" when there is too little of the account's own data to stand on, "experiment" when the post is a test). When the account has fewer than five of its own posts, or nothing in the evidence supports a post, use "thin" or "experiment", say in reading what is missing, and write the post as a test with a clear hypothesis and the number that will judge it.
- Every competitorInsights item has basis: "measured" when it rests on numbers listed for that account in the evidence, "general" when it is a pattern from general knowledge. A "general" insight names no real account: its competitor field says "General pattern in this niche".
- Every weeklyPlan item has a maker: "claude" when the person's own Claude will make the video, "you" when the person makes it. Read "Who makes the videos" in the settings: "My Claude makes them" makes every post "claude"; "A mix" makes "claude" the posts that work without filming and "you" the rest; anything else, or no setting, makes every post "you".
- A "claude" post is made entirely on a computer, with no filming and no footage of the person: only the kinds listed under "Videos their Claude may make" (animated graphics and animated text when none are listed). Its format is Reel, or Carousel for a photo slideshow. Its direction says, concretely, what is on screen scene by scene and the text that appears; its production says "Made by your Claude:" and the kind of video, with no gear or filming. Its evidence and rationale follow the same rules as every other post.
- ${FILMING_DIRECTION_RULE}`;

export function buildUserPrompt(input: GenerateInput, brand?: BrandDetail | null, evidence?: Evidence | null): string {
  const parts: string[] = [];
  parts.push(`# My account`);
  parts.push(`Account / handle: ${input.clientHandle || "(not given)"}`);
  parts.push(`Niche: ${input.niche || "(not given)"}`);
  parts.push(`Primary platform: ${input.platform || "Instagram"}`);
  // A short vertical video has the platform's own name: a Short on YouTube, never a Reel.
  if (input.platform && shortVideoName(input.platform) !== "Reel") parts.push(`On ${input.platform} a short vertical video is a "${shortVideoName(input.platform)}": use that word for format, never "Reel". Do not call ${input.platform} anything other than the primary platform.`);
  if (input.goal.trim()) parts.push(`My goal: ${input.goal.trim()}`);
  if (input.brandVoice.trim())
    parts.push(`Brand voice / notes: ${input.brandVoice.trim()}`);

  const brandBlock = brandContext(brand);
  if (brandBlock) parts.push(brandBlock);

  // The videos the person typed on the Planner: each one is a post of the week (lib/planIdeas.ts).
  const ideas = ideasBlock(cleanIdeas(input.ideas), input.onCamera);
  if (ideas) parts.push(ideas);

  // The Growth Strategy (lib/strategy.ts): the week is built from it.
  const strategy = strategyLines(brand?.strategy);
  if (strategy) {
    parts.push(`\n# The account's growth strategy (written with SOCIA and kept by the user; build the week from it)`);
    parts.push(strategy);
    parts.push(`${input.onCamera != null ? "Spread" : `Plan ${brand!.strategy!.frequency.posts_per_week} posts this week, the strategy's pace, even where the general rule says 5 to 7. Spread`} them across the content pillars, include a running experiment's test when one is due, and say in each post's rationale which pillar or priority it serves. A post that tests a running experiment carries that experiment's id in its experiment field; every other post has an empty experiment field.`);
  }

  if (evidence?.goalsBlock) {
    parts.push(`\n# The account's measurable goals (aim the week at the main goal; never claim a post will reach a target)`);
    parts.push(evidence.goalsBlock);
  }

  if (evidence?.calendarBlock) {
    parts.push(`\n# Already on the Calendar for the next two weeks`);
    parts.push(evidence.calendarBlock);
    parts.push(`Don't repeat these topics, and prefer days that are free; a day already holding a post gets a new one only when the posting target needs it.`);
  }

  if (brand?.growth?.routine?.filming?.length) {
    parts.push(`\n# Filming time`);
    parts.push(FILMING_ALLOWANCE_LINE);
  }

  // How much of the account's own history there is: a new account's plan is a
  // set of tests built on its goals and niche, not a read of its own results.
  if (evidence?.readinessBlock) {
    parts.push(`\n# How much to lean on the account's own results`);
    parts.push(evidence.readinessBlock);
    if (evidence.stage && evidence.stage !== "established") {
      parts.push(`This is a starter plan. SOCIA doesn't know yet what works for this account, so the week is built to find out:
- Each post tests one running experiment (put its id in "experiment"), and the week covers each running experiment with posts for both of its options, so they can be compared.
- Concepts, hooks and beats are original for this account. A pattern from the niche may shape a post; name it in the evidence as seen on other accounts, never as proof it will work here, and never copy their content.
- Every post is complete enough to make without asking: the hook, the beats (the storyboard), the filming direction, the editing and the CTA, inside the person's stated time, gear and editing skill.
- Post on the person's posting days and only as often as their target; plan filming on their filming days. Never suggest posting daily unless they chose seven days.
- Each post's evidence split: observed is only what SOCIA read (the niche numbers, their profile); expected is a hypothesis to test, never a prediction of views or growth.`);
    }
  }

  // Real data first, the user's own notes after it. When SOCIA holds nothing,
  // the notes are all there is and the model is told so.
  parts.push(`\n# The account's recent posts and how they performed`);
  if (evidence?.postsBlock) {
    parts.push(`(Pulled by SOCIA from the connected Instagram account. Real numbers. Cite a post by its id.)`);
    parts.push(evidence.postsBlock);
    if (input.recentPosts.trim()) parts.push(`\nThe user's own notes on recent posts:\n${input.recentPosts.trim()}`);
  } else {
    parts.push(
      input.recentPosts.trim() ||
        "(none provided: SOCIA has none of this account's posts yet. Infer cautiously from the niche, say so in the audit, give every post an evidenceSplit basis of \"thin\" or \"experiment\", and write each post as a test with the number that will judge it)",
    );
  }

  parts.push(`\n# When this account's audience engages`);
  parts.push(
    input.audienceWindows?.trim() ||
      "(not enough of the account's own posts to map timing yet — do not guess posting times)",
  );

  parts.push(`\n# Competitor / niche accounts and what's working for them`);
  if (evidence?.competitorsBlock) {
    parts.push(`(Found and measured by SOCIA: YouTube figures come from the YouTube Data API; Instagram figures are what SOCIA last read from Instagram for that account, with the date. An account with no figures has not been read: never estimate its numbers.)`);
    parts.push(evidence.competitorsBlock);
    if (input.competitors.trim()) parts.push(`\nThe user's own notes on competitors:\n${input.competitors.trim()}`);
  } else {
    parts.push(
      input.competitors.trim() ||
        "(none provided: base competitor insights on well-known patterns in this niche, give each basis \"general\", and name no real account)",
    );
  }

  if (evidence?.experimentsBlock) {
    parts.push(`\n# How the strategy's experiments are going`);
    parts.push(`(Each test post measured against the account's own median once its numbers settle; 3 settled posts are needed for a verdict.)`);
    parts.push(evidence.experimentsBlock);
    parts.push(`Follow each experiment's next step: plan the missing test posts for one still too early or mixed, build a supported one into the week as a regular post, and don't test a running experiment that isn't supported again unless something about it changes. Never present a result as more certain than it says.`);
  }

  if (evidence?.decisionsBlock) {
    parts.push(`\n# What the person approved, turned down and added`);
    parts.push(evidence.decisionsBlock);
    parts.push(`Respect these calls. Never propose a turned-down idea again, in any wording. Act on each reason: "Too difficult to film" means simpler production; "Too repetitive" means a different topic and format; "I don't like this format" means leave that format out; "I want something more creative" means a bolder concept; "Not relevant to my brand" means stay closer to their pillars. Build on what they approved and on their own ideas, and when a post follows from one, say so in its evidence field.`);
  }

  if (evidence?.formatsBlock) {
    parts.push(`\n# Formats that lead in this niche`);
    parts.push(`(Found by SOCIA across other accounts' public posts: each format has at least 3 examples from 2 accounts, and its numbers are those posts' results against their own creators' medians. Other accounts' results, not this account's.)`);
    parts.push(evidence.formatsBlock);
    parts.push(`You may build planned posts on these formats, adapted to this account and never copied. When a post uses one, name the format and its basis in that post's evidence field (for example "Uses the one-take build format: median 2.1x across 4 niche examples").`);
  }

  if (evidence?.playbookBlock) {
    parts.push(`\n# ${evidence.playbookBlock}`);
    parts.push(`Build planned posts on these where they fit this account, adapted and never copied, and name the pattern and its basis in that post's evidence field.`);
  }

  if (evidence?.trendsBlock) {
    parts.push(`\n# Trending in this niche now`);
    parts.push(evidence.trendsBlock);
    parts.push(`Use what leads: build some planned posts on a leading hook structure or topic, adapted to this account's own subjects, place and voice. Write each hook fresh; the opening lines above are other people's words, so learn their structure and never reuse their wording. When a post uses a trend, name it and its basis in that post's evidence field (for example "POV opening: median 2.1x across 5 niche Reels from 3 accounts"). Never present another account's result as a prediction for this one, and ignore a group that doesn't lead.`);
  }

  if (evidence?.provenBlock) {
    parts.push(`\n# Reels that took off for the account's competitors and in its niche (build the week on these)`);
    parts.push(evidence.provenBlock);
    parts.push(`Each Reel says whether it is from one of the account's competitors (the ones it follows on Discover) or from another account in its niche, and none of them has been used in an earlier plan. Build the week on them, in two ways:
- Remake one Reel: keep its format, hook structure, pacing and angle, and remake it with this account's own subject, place, footage and words.
- Combine and adapt: take what works in two or more of the Reels (one Reel's hook, another's format, a third's topic) and turn it into a new idea that fits this account's niche, product and audience better than any one of them does. Not every post has to copy a competitor; the best idea is often a competitor's Reel changed to suit this account.
Use the competitors' Reels first, then the other niche Reels. Start with the higher track records (a count, out of 100, of how that Reel and the niche Reels sharing its hook and topic did). Put the id of the Reel the post leans on most (for example "R2") in its "reference" field, and in its evidence field name whose Reels it uses and what it takes from each. When a Reel can't be filmed or made by this account at all, skip it, and leave "reference" as "" for a post that isn't built on one. Never reuse a Reel's wording, never cite an id that isn't listed, and never say the post will match a Reel's result: those are other accounts' numbers.
Every post the person films (not an animated one) gets an example to film from (Noah, 2026-11-23: "first it gives an example of what the video should look like"), separate from the idea's "reference": "filmReference" is the id of the listed Reel made the same way this post is filmed, by its "made:" (talking to camera, screen recording, filmed footage or a skit, matching the post's beats), with a similar setting and framing, even on a different topic. It can be a different Reel from "reference". Never a Reel made as animation or slides for a filmed post, and never one whose "made:" isn't given. Then "filmLike" says in one sentence what to copy from it when filming: camera distance and angle, movement, setting, light, pacing of the cuts. Never its words. For an animated post, or when no listed Reel was made that way, "filmReference" and "filmLike" are "".`);
  }

  if (evidence?.outcomesBlock) {
    parts.push(`\n# What happened to the last plan`);
    parts.push(evidence.outcomesBlock);
    parts.push(
      `Use this. Keep and build on what beat the median (same format and hook structure, a new angle). Change what fell short: a different format, hook or topic, and say what you changed. A planned post that was never made is a signal about effort, not about the idea: re-propose it at most once, simplified so it is easier to film, and only if it still fits the goal. For every post in the new plan whose idea follows from a previous result, say so in its evidence field (for example "Follows last week's Friday Reel, which did 2.1× the median").`,
    );
  }

  // The number of filmed posts the person chose (or their last plan's, lib/planMix.ts) beats every general rule above.
  if (input.onCamera != null) {
    parts.push(`\n# How many posts this week (chosen by the person; this overrides the 5 to 7 rule and the strategy's pace)`);
    parts.push(
      input.onCamera > 0
        ? `weeklyPlan has exactly ${input.onCamera} post${input.onCamera === 1 ? "" : "s"}, each filmed with the person on camera or filming their own footage.${input.animated ? ` SOCIA adds ${input.animated} animated post${input.animated === 1 ? "" : "s"} separately, so don't write animated or no-filming posts here.` : ""} Keep to the kind of content the account already makes; change it only where the evidence says to, and say so.`
        : `weeklyPlan is an empty list: this week is ${input.animated ?? 0} animated post${input.animated === 1 ? "" : "s"} only, which SOCIA writes separately. Still give the full audit, fixes and competitor insights.`,
    );
  }
  parts.push(
    `\n# Task\nProduce the full deliverable: a one-line diagnosis in plain words (no score, grade or rating out of 100: nothing here is measured), an honest audit, the account's strengths, its concrete problems (with the evidence and the impact of each), the top 3 fixes ranked by expected impact, competitor insights with the specific gap this account should close, and ${input.onCamera != null ? `a plan of exactly ${input.onCamera} post${input.onCamera === 1 ? "" : "s"}` : "a 5-7 post plan"} for the coming week where each post has a written hook and cites its evidence.`,
  );

  return parts.join("\n");
}
