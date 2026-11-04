// The SOCIA reel: the reference reel's scenes and motion, with the story
// widened to the whole product (eight chapters, 9:16). See BREAKDOWN.md.
// Every number here is real and was read from SOCIA's own MCP tools for the
// Salvo's Pizza workspace (@salvoshermitage) on 2026-10-27; the one example
// panel that is not account data is labelled EXAMPLE on screen. Labels are
// the app's own. Change copy here, never in the components.

export const FPS = 30;
export const W = 1080;
export const H = 1920;

/**
 * Chapter boundaries in seconds. Each chapter is as long as its narration line
 * plus the beat the picture needs after it; the hook keeps the reference's cut.
 * Set from the measured voice clips in audio/vo (see sound.ts).
 */
export const CHAPTERS = {
  hook: { start: 0, end: 5.0 },
  meet: { start: 5.0, end: 11.9 },
  context: { start: 11.9, end: 22.3 },
  outliers: { start: 22.3, end: 30.0 },
  plan: { start: 30.0, end: 38.4 },
  make: { start: 38.4, end: 50.35 },
  loop: { start: 50.35, end: 57.15 },
  cta: { start: 57.15, end: 63.5 },
} as const;
export const TOTAL_FRAMES = Math.round(CHAPTERS.cta.end * FPS);

export const HEADER = { left: "# KNOW WHAT TO POST · WITH SOCIA", total: 8 };
export const FOOTER = { left: "SOCIA", right: "SOCIAOS.COM" };

/** Chapter 1: the hook. Instagram views, last 30 days vs the 30 before. (Account analysis.) */
export const HOOK = {
  line1: "HOW TO GO FROM",
  from: 11813, // views, previous 30 days
  to: 49798, // views, last 30 days
  line3a: "MONTHLY VIEWS WITH",
  line3b: "SOCIA",
  script: { before: "without ", em: "guessing", after: " what to post..." },
  cards: {
    before: { tag: "LAST MONTH", handle: "salvoshermitage", a: { n: 11813, label: "views" }, b: { n: 59357, label: "reach" } },
    after: { tag: "THIS MONTH", handle: "salvoshermitage", a: { n: 49798, label: "views" }, b: { n: 76855, label: "reach" } },
  },
  source: "@salvoshermitage on Instagram, Sep 27 to Oct 26, 2026, as SOCIA Analytics shows it",
};

/** Chapter 2: what SOCIA is, in five verbs. Each one is a chapter that follows. */
export const MEET = {
  line1: "MEET",
  line2: "SOCIA",
  body: { a: "Your social media team, ", b: "in one app", c: "." },
  verbs: [
    { word: "Reads", sub: "your accounts" },
    { word: "Plans", sub: "your week" },
    { word: "Makes", sub: "your videos" },
    { word: "Posts", sub: "for you" },
    { word: "Learns", sub: "from every result" },
  ],
  caption: { before: "Here is ", em: "how it works." },
};

/** Chapter 3: the hub and five spokes = the five things SOCIA reads. */
export const CONTEXT = {
  step: "STEP 01",
  line1: "CONNECT YOUR",
  line2: "ACCOUNTS",
  once: "once",
  platforms: "Instagram · Facebook · YouTube · TikTok",
  hub: "SOCIA",
  spokes: [
    { key: "account analysis", text: "Views, reach, saves and shares, per post", at: "tl" },
    { key: "niche intelligence", text: "Your niche, its themes and what works in it", at: "tr" },
    { key: "audience insights", text: "Who engages, when, and which formats", at: "bl" },
    { key: "competitor analysis", text: "The accounts you're up against, observed", at: "br" },
    { key: "reels tracking", text: "Every Reel ranked against your median", at: "b" },
  ] as const,
  caption: { before: "Agency-grade analytics, ", em: "running by themselves." },
};

/** Chapter 4: the list panel = the account's real top posts, as SOCIA ranks them. */
export const OUTLIERS = {
  step: "STEP 02",
  line1: "SEE WHAT",
  line2: "STANDS OUT",
  body: { a: "SOCIA ranks every post against ", b: "your own median", c: ". The outliers ", d: "jump out on their own", e: "." },
  panel: { title: "MY TOP POSTS · 90 DAYS", chip: "REELS TRACKING" },
  rows: [
    { initial: "P", title: "Perfection.", sub: "REEL · AUG 18", views: "102K", x: "84.6x", hue: "#8b5cf6" },
    { initial: "F", title: "Feeding a crowd this week?", sub: "REEL · SEP 30", views: "12.9K", x: "3.4x", hue: "#ec4899" },
    { initial: "S", title: "Square pie. Cut fresh.", sub: "REEL · OCT 17", views: "29.4K", x: "2.3x", hue: "#0ea5e9" },
    { initial: "P", title: "Pizza. Pasta. Real deal.", sub: "REEL · SEP 24", views: "2.7K", x: "1.5x", hue: "#d97706" },
  ],
  /** The optional extra: the same answers inside Claude, through SOCIA's MCP tools. */
  mcp: { chip: "OPTIONAL", sub: "Connect SOCIA to Claude through MCP and ask it there." },
  caption: { before: "Study the ", em: "2x+ posts.", after: " They are proven ideas." },
};

/** Chapter 5: the matrix = the weekly Content Plan SOCIA wrote for this account. */
export const PLAN = {
  step: "STEP 03",
  script: "This is where the magic happens.",
  line1: "BUILD YOUR",
  line2: "CONTENT PLAN",
  body: { a: "SOCIA turns your winners into ", b: "a week of posts", c: ". Each cell is ", d: "one decision", e: " made for you." },
  cols: ["HOOK", "FORMAT", "WHY", "WHEN", "CONFIDENCE"],
  rows: ["MON · CATERING TRAY", "TUE · DOUBLE VS REGULAR", "WED · THE PIZZAIOLO", "THU · 3 LEVELS OF CHEESE", "FRI · CHEESE PULL", "SAT · \"I'LL WAIT.\" AGAIN", "SUN · LOCAL COLLAB"],
  /** Cells that light up: [row, col]. The three highest-conviction calls in the plan. */
  winners: [
    [1, 3], // Tuesday goes into the one proven window
    [4, 1], // Friday repeats the proven format
    [5, 4], // Saturday is the highest-confidence repeat
  ] as [number, number][],
  caption: { a: "7 posts × 5 answers = ", em: "35 decisions backed by your data" },
  total: 35,
};

/**
 * Chapter 6: Content Studio. Top panel: the clip bin that fills as you film and
 * the cuts SOCIA keeps building from it. Bottom panel: the rater's six
 * categories (lib/studio.ts CATEGORY_INFO) with one fix each. The scores are an
 * illustrative example and say so on screen; the category names and what each
 * one analyses are the app's.
 */
export const MAKE = {
  step: "STEP 04",
  line1: "MAKE IT IN",
  line2: "CONTENT STUDIO",
  bin: {
    title: "YOUR CLIPS",
    chip: "DROP THEM IN AS YOU FILM",
    clips: ["MON", "MON", "WED", "WED", "WED", "FRI", "SAT", "SAT"],
    arrow: "→",
    cuts: { title: "CUTS SOCIA BUILT", items: ["Cheese pull · 14 s", "The pizzaiolo · 22 s", "Square pie · 11 s"] },
  },
  rater: {
    title: "THE RATER",
    chip: "EXAMPLE",
    categories: [
      { id: "Hook", score: 5, fix: "Subject is in frame at 0.0 s. Keep it." },
      { id: "Pacing", score: 3, fix: "Static from 6 to 11 s. Cut to 8 s." },
      { id: "Clarity", score: 4, fix: "One idea. Add the price on screen." },
      { id: "Visual", score: 4, fix: "Frame 3 is dark. Brighten or drop it." },
      { id: "CTA", score: 2, fix: "No ask. End on \"order for Friday\"." },
      { id: "Audio", score: 4, fix: "Spoken line matches the picture." },
    ],
    max: 5,
  },
  caption: { before: "It grades every cut and ", em: "tells you what to change." },
};

/** Chapter 7: the two strips = schedule the week, it posts itself, ask what worked, double down. */
export const LOOP = {
  step: "STEP 05",
  line1: "SCHEDULE IT, THEN",
  line2: "DOUBLE DOWN",
  strip1: { title: "WEEK 1", sub: "Scheduled. SOCIA posts it.", n: 7 },
  chip: "ASK SOCIA · WHAT WORKED?",
  winners: [1, 5], // indices in strip 1 that light up
  strip2: { title: "WEEK 2", sub: "Only what worked", n: 7 },
  caption: { before: "Posts itself, on time, ", em: "while you run the business." },
};

/** Chapter 8: the call to action. */
export const CTA = {
  follow: "Follow,",
  line1: "then comment",
  word: "\"EARLY ACCESS\"",
  /** The launch offer (Noah's pick, 2026-10-27). Matches the 7-day trial checkout gives. */
  offer: "First 50 get a week free",
  body: { a: "& I will send you the link to ", b: "try SOCIA", c: " before everyone else." },
};
