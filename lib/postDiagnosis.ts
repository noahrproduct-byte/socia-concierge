// "Why did this underperform?" for one published post: the single most useful
// thing to change next, read from its own totals against the account's own
// other posts (lib/postVerdicts.ts), never against industry numbers. Checked
// in order, and the first lever that explains the result wins, as a flop
// usually fails at one place: is the account being shown less lately, then
// how many people saw this post, then whether they reacted, then whether they
// passed it on, then whether the caption asked for anything. Instagram's API
// gives no retention curve or skip rate, so nothing here says where in the
// video people left. Pure.
import type { PostCard } from "@/lib/overview";
import { captionAsks, postVerdicts, type Verdict } from "@/lib/postVerdicts";

export type DiagnosisKind = "distribution" | "reach" | "reaction" | "spread" | "ask" | "strong" | "usual" | "unknown";

export type Diagnosis = {
  kind: DiagnosisKind;
  /** the section's heading: why it worked, the biggest thing to fix, or what to try next */
  heading: string;
  title: string;
  /** what the numbers show, each line naming the total it comes from */
  evidence: string[];
  /** the one change to make next */
  fix: string;
  /** the next step: a prompt for the video editor, or a question for Ask SOCIA */
  action: { label: string; kind: "editor" | "ask"; prompt: string } | null;
};

/** Below this share of the account's usual, a reading counts as a problem. */
const LOW = 0.6;
/** At or above this, the post did well enough to copy. */
const STRONG = 1.3;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const x = (r: number) => `${r >= 10 ? Math.round(r) : r.toFixed(1)}x`;
const seen = (p: PostCard) => p.views ?? p.reach;
const ratioOf = (v: Verdict) => v.share * 2;
const quote = (t: string) => `"${t.replace(/\s+/g, " ").trim().slice(0, 60)}"`;

/** The diagnosis of `p` among `posts` (the account's posts, newest first or in any order). */
export function postDiagnosis(p: PostCard, posts: PostCard[]): Diagnosis {
  const v = postVerdicts(p, posts);
  const [reach, reaction, spread, ask] = v;
  const name = quote(p.title || p.caption || "this post");
  const what = p.isVideo ? "video" : "post";

  if (reach.tone === "none" && reaction.tone === "none") {
    return { kind: "unknown", heading: "What to try next", title: "Not enough to compare yet", evidence: [reach.line], fix: "SOCIA reads a post against your own other posts. Once a few more have numbers, it can say what held this one back.", action: null };
  }

  // Did well: say so, and offer more of the same.
  if (p.multiplier != null && p.multiplier >= STRONG && reach.tone !== "bad") {
    const best = [reach, reaction, spread].filter((r) => r.tone === "good").map((r) => r.line);
    return {
      kind: "strong", heading: "Why this worked", title: "Make more like this",
      evidence: [`${x(p.multiplier)} your usual likes, comments, saves and shares`, ...best],
      fix: `Keep what this ${what} did: the same kind of opening, subject and length. Change one thing at a time so the next one shows what made it work.`,
      action: { label: "Make another like it", kind: "editor", prompt: `Make a new ${what} like my post ${name}, which got ${x(p.multiplier)} my usual interactions. Keep its kind of opening, subject and pace, with my new clips.` },
    };
  }

  // 1. Is the account being shown less lately? This post and most of the last three before it got under 60% of the usual views.
  const others = posts.filter((o) => o.id !== p.id);
  const usualViews = median(others.map(seen).filter((n): n is number => n != null && n > 0));
  const before = others.filter((o) => new Date(o.published).getTime() < new Date(p.published).getTime()).sort((a, b) => b.published.localeCompare(a.published)).slice(0, 3);
  const lowRun = usualViews ? before.filter((o) => (seen(o) ?? Infinity) < usualViews * LOW).length : 0;
  if (reach.tone === "bad" && ratioOf(reach) < LOW && before.length === 3 && lowRun >= 2) {
    return {
      kind: "distribution", heading: "Biggest thing to fix", title: "Fewer people are being shown your posts lately",
      evidence: [`This ${what}: ${reach.line}`, `${lowRun} of the 3 posts before it also got under ${Math.round(LOW * 100)}% of your usual views`],
      fix: "When several posts in a row are shown to fewer people, look past this one post first. Instagram shows less of an account that posts videos with a TikTok or CapCut watermark or other people's clips, and it judges the last 30 days. Post your own footage only, and test new openings as Trial Reels before they go on your grid.",
      action: { label: "Check my recent posts", kind: "ask", prompt: `My last few posts were shown to far fewer people than usual (this one: ${reach.line}). Check my recent posts for anything Instagram might treat as not original, and tell me what to post this week instead.` },
    };
  }

  // 2. Fewer people saw this one.
  if (reach.tone === "bad") {
    return {
      kind: "reach", heading: "Biggest thing to fix", title: "Fewer people saw this one",
      evidence: [reach.line, ...(reaction.tone !== "none" && reaction.tone !== "bad" ? [`Those who saw it reacted about as usual: ${reaction.line}`] : [])],
      fix: `Instagram shows a ${what} to more people when its first seconds keep them watching, so the opening is the first thing to change. Start on the most striking moment, with a few words on screen that say what this is.`,
      action: { label: "Make a better opening", kind: "editor", prompt: `Make a new version of my post ${name}, which got ${reach.line}. Open on its most striking moment in the first second, with a few words on screen that say what it is, then keep the rest tight.` },
    };
  }

  // 3. Seen, but people didn't react.
  if (reaction.tone === "bad") {
    return {
      kind: "reaction", heading: "Biggest thing to fix", title: "People saw it but didn't react",
      evidence: [`Views were ${reach.tone === "good" ? "above" : "about"} your usual: ${reach.line}`, reaction.line],
      fix: "Give people something to answer. End on a choice or a question they have an opinion on, and say it on screen as well as in the caption.",
      action: { label: "Rewrite the ending", kind: "ask", prompt: `My post ${name} was seen as usual but got ${reaction.line}. Write 3 new endings for it, each a question or a choice people would want to answer, with the words to put on screen.` },
    };
  }

  // 4. Watched and liked, but not passed on.
  if (spread.tone === "bad") {
    return {
      kind: "spread", heading: "Biggest thing to fix", title: "Not something people sent or saved",
      evidence: [spread.line],
      fix: "People send a post that is about someone they know and save one they'll need again. Name who it's for (\"send this to the friend who...\") or make it useful to come back to.",
      action: { label: "Make a more shareable version", kind: "editor", prompt: `Make a new version of my post ${name}, which got ${spread.line}. Make it something people send to a friend: say on screen who it's for, and end with "send this to the friend who..." in words that fit my business.` },
    };
  }

  // 5. Nothing asked for.
  if (ask.tone === "bad" && !captionAsks(p.caption)) {
    return {
      kind: "ask", heading: "What to try next", title: "The caption doesn't ask for anything",
      evidence: [ask.line],
      fix: "Tell people the one thing to do next, in the caption's first line: a question to answer, a choice to make, or how to order.",
      action: { label: "Rewrite my caption", kind: "ask", prompt: `Rewrite the caption of my post ${name} so its first line asks people to do one thing: answer a question, make a choice or order. Give me 3 versions.` },
    };
  }

  return {
    kind: "usual", heading: "What to try next", title: "About as usual",
    evidence: [reach.line, reaction.line].filter((l) => !/^Needs|^The platform/.test(l)),
    fix: "Nothing stands out as the problem. Keep it as a control and change one thing in the next post, like a bolder opening, so you can see what that one change does.",
    action: { label: "Try a bolder opening", kind: "editor", prompt: `Make a new version of my post ${name} with a bolder opening: start on its most striking moment, with a few words on screen in the first second.` },
  };
}
