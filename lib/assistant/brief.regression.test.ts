// The failure conversation (Noah, 2026-11-18): an on-camera SOCIA Reel, revised ten times. Each step is run
// through what SOCIA does before and after the model: how the message is read, what the prompt asks for,
// how the brief carries forward, and what the checks do with the kinds of answers that went wrong.
import { describe, expect, it } from "vitest";
import { briefBlock, checkDraft, formatRule, nextBrief, readTurn, sanitizeBrief, spokenLines, spokenSeconds, type CreativeBrief, type Deliverable, type Turn } from "./brief";
import { falseClaimsIn, productBlock } from "../socia/productKnowledge";

type Step = { say: string; turn: Turn; deliverable: Deliverable; model?: Partial<CreativeBrief> };

const STEPS: Step[] = [
  { say: "Write me an on-camera Reel script for SOCIA. I'll film it at my desk.", turn: "new", deliverable: "full_script",
    model: { contentType: "Instagram Reel, on camera", topic: "SOCIA", audience: "growing creators and local businesses", platform: "Instagram", goal: "sign-ups", tone: "direct, friendly", cta: "Comment PLAN" } },
  { say: "Change the angle: SOCIA is every tool a creator needs in one app.", turn: "revise", deliverable: "full_script",
    model: { topic: "SOCIA as every creator tool in one app" } },
  { say: "Only give me the spoken lines.", turn: "format", deliverable: "spoken_lines" },
  { say: "Change the hook to \"This app was made for you\".", turn: "revise", deliverable: "spoken_lines",
    model: { hook: "This app was made for you" } },
  { say: "Make it an onboarding walkthrough: start with signing up, then every step.", turn: "revise", deliverable: "spoken_lines",
    model: { structure: "onboarding walkthrough, then the features" } },
  { say: "Add the more important SOCIA features too.", turn: "revise", deliverable: "spoken_lines",
    model: { mustInclude: ["Content Plan", "Video editor", "Discover", "Analytics"] } },
  { say: "No, AI Content Plan and AI Content Generation are different features. The plan plans, generation makes the videos.", turn: "revise", deliverable: "spoken_lines",
    model: { mustInclude: ["AI Content Generation (animated videos, Make This Video)"] } },
  { say: "Make it more storytelling.", turn: "revise", deliverable: "spoken_lines",
    model: { structure: "story: the problem, finding SOCIA, the walkthrough, the result" } },
  { say: "It got cut off at the end again.", turn: "again", deliverable: "spoken_lines" },
  { say: "Send me the complete script again.", turn: "again", deliverable: "spoken_lines" },
];

describe("the failure conversation, turn by turn", () => {
  it("reads every message as the right kind of turn and keeps the requirements", () => {
    let brief: CreativeBrief | null = null;
    let hasWork = false;
    for (const s of STEPS) {
      const got = readTurn(s.say, { hasWork, brief });
      expect({ say: s.say, ...got }).toEqual({ say: s.say, turn: s.turn, deliverable: s.deliverable });
      const fromModel = sanitizeBrief({ ...(brief ?? {}), ...(s.model ?? {}), output: got.deliverable });
      brief = nextBrief(brief, fromModel, got.turn, got.deliverable, s.say);
      hasWork = true;
    }
    // After ten turns nothing set early was lost, and every correction is still there.
    expect(brief).not.toBeNull();
    expect(brief!.topic).toBe("SOCIA as every creator tool in one app");
    expect(brief!.audience).toBe("growing creators and local businesses");
    expect(brief!.cta).toBe("Comment PLAN");
    expect(brief!.hook).toBe("This app was made for you");
    expect(brief!.output).toBe("spoken_lines");
    expect(brief!.mustInclude).toEqual(expect.arrayContaining(["Content Plan", "Video editor", "Discover", "Analytics", "AI Content Generation (animated videos, Make This Video)"]));
    expect(brief!.corrections.some((c) => c.includes("different features"))).toBe(true);
    const block = briefBlock(brief);
    expect(block).toContain('Hook (use exactly): This app was made for you');
    expect(block).toContain("latest message wins");
  });

  it("never runs research again after the first message", () => {
    let brief: CreativeBrief | null = null;
    STEPS.forEach((s, i) => {
      const got = readTurn(s.say, { hasWork: i > 0, brief });
      const continuing = got.turn === "revise" || got.turn === "format" || got.turn === "again";
      expect(continuing).toBe(i > 0);
      brief = nextBrief(brief, sanitizeBrief({ ...(brief ?? {}), ...(s.model ?? {}), output: got.deliverable }), got.turn, got.deliverable, s.say);
    });
  });

  it("asks for exactly the deliverable, complete, and nothing extra", () => {
    const spoken = formatRule("spoken_lines", "format");
    expect(spoken).toContain("only the spoken words, complete");
    expect(spoken).toContain("No beat numbers");
    expect(spoken).toContain("no caption");
    const revise = formatRule("spoken_lines", "revise");
    expect(revise).toContain("never only the changed part");
    expect(revise).toContain("never explain why the last answer was wrong");
    const again = formatRule("spoken_lines", "again");
    expect(again).toContain("from the first line to the last");
    const full = formatRule("full_script", "new");
    expect(full).toContain('"Your lines:"');
    expect(full).toContain("Caption, sound, filming notes and editing notes only when the person asked for them");
  });
});

describe("the checks on what came back", () => {
  const SCRIPT = `1. 0 to 5s
Film: Chest-up selfie at your desk.
On screen: "This app was made for you"
Say: This app was made for you.
Transition: Cut on action.

2. 5 to 12s
Film: Screen recording of signing up.
On screen: "Step 1"
Say: Sign up, connect your Instagram, and SOCIA reads your posts.`;

  it("reduces a script to the spoken lines when only the lines were asked for", () => {
    const c = checkDraft(SCRIPT, "spoken_lines");
    expect(c.body).toBe("This app was made for you.\n\nSign up, connect your Instagram, and SOCIA reads your posts.");
    expect(c.fixed).toContain("kept only the spoken lines");
    expect(c.problems).toEqual([]);
  });

  it("adds the Your lines block a full script was missing", () => {
    const c = checkDraft(SCRIPT, "full_script");
    expect(c.body).toContain("Your lines:\nThis app was made for you.");
  });

  it("catches a script that stops mid-sentence", () => {
    const c = checkDraft("This app was made for you. It plans your week, edits your Reels and", "spoken_lines");
    expect(c.problems).toEqual([{ kind: "incomplete" }]);
  });

  it("catches an answer with no deliverable", () => {
    expect(checkDraft("", "spoken_lines").problems).toEqual([{ kind: "missing" }]);
  });

  it("catches the false claims from the failure conversation", () => {
    const audio = checkDraft("Discover finds the hooks and trending audio to use.", "spoken_lines", falseClaimsIn);
    expect(audio.problems.map((p) => p.kind)).toContain("claim");
    const plan = checkDraft("The AI Content Plan makes your videos for you every week.", "spoken_lines", falseClaimsIn);
    expect(plan.problems.map((p) => p.kind)).toContain("claim");
    const fine = checkDraft("The Content Plan plans your week. The Video editor builds the Reel from your clips. SOCIA doesn't list trending audio.", "spoken_lines", falseClaimsIn);
    expect(fine.problems).toEqual([]);
  });

  it("works out the length from the words", () => {
    const lines = "This app was made for you. Growing creator or local business, stop scrolling. Here's how it starts. Setup is quick, and I'll show you all of it. You connect your account, tell it your brand and your goal, and Socia builds your plan from your own data. Your plan fills your calendar. Analytics shows your best times to post. Every tool a creator needs, in one app. Comment PLAN and come give Socia a try.";
    const words = lines.split(/\s+/).length;
    expect(spokenSeconds(lines, "spoken_lines")).toBe(Math.round(words / 2.5));
    expect(spokenLines(SCRIPT)).toContain("Sign up, connect your Instagram");
  });
});

describe("what the assistant knows about SOCIA", () => {
  it("keeps the Content Plan and content generation apart, and lists no trending audio", () => {
    const p = productBlock();
    expect(p).toMatch(/"AI Content Generation" means[^\n]*Never the Content Plan/);
    expect(p).toMatch(/Content Plan \(AI Content Plan\)[^\n]*It plans; it doesn't make the finished video/);
    expect(p).not.toMatch(/(?:lists|shows|finds) (?:Instagram's )?trending audio/i);
    expect(falseClaimsIn(p)).toEqual([]);
  });
});

describe("false claims and denials", () => {
  it("flags the claim but not a sentence that denies it", () => {
    expect(falseClaimsIn("Post it and it will go viral.")).toHaveLength(1);
    expect(falseClaimsIn("Nothing will go viral for sure, and there's never a guarantee of views.")).toEqual([]);
  });
});

describe("first messages", () => {
  const first = (t: string) => readTurn(t, { hasWork: false });
  it("tells a script apart from ideas, a week's plan and a question", () => {
    expect(first("Help me pitch my SaaS in a Reel")).toEqual({ turn: "new", deliverable: "full_script" });
    expect(first("Give me 5 video ideas for this week")).toEqual({ turn: "question", deliverable: "answer" });
    expect(first("Write a caption for my pizza post")).toEqual({ turn: "new", deliverable: "caption" });
    expect(first("Why did my views drop?")).toEqual({ turn: "question", deliverable: "answer" });
    expect(first("What's working in my niche right now?")).toEqual({ turn: "new", deliverable: "research" });
  });
});
