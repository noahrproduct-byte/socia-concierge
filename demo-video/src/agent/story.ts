// The SOCIA agent reel (v3, 2026-10-29: no pizzeria, best-time scene, goofy avatar, "coming soon" in place of the site): Noah's second reference (~/Downloads/Video-1457.mp4, the
// "Harvey" reel) rebuilt for SOCIA. One continuous narration take; every caption
// word, scene change, stamp and counter is timed to that take's words
// (whisper-cli word timings of audio/vo.mp3). Change copy here, never in Agent.tsx.
//
// v3: no pizzeria. The creator posts, draft, best time and rater scores are an
// illustrative example and say EXAMPLE on screen; no growth numbers are claimed.

export const FPS = 30;
export const W = 1080;
export const H = 1920;
export const END = 43.4; // the take ends at 42.1 s; the last frame holds
export const TOTAL_FRAMES = Math.round(END * FPS);

/** A spoken word: its text on screen, its start time in the take, and whether it is the line's accent word. */
export type Word = { w: string; t: number; em?: boolean; strike?: number };
const wd = (w: string, t: number, em = false, strike?: number): Word => ({ w, t, em, strike });

/** One caption phrase per sentence (or half-sentence), shown top-left and revealed word by word. */
export const PHRASES: Word[][] = [
  [wd("If", 0.01), wd("you're", 0.16), wd("a", 0.42), wd("growing", 0.47, true), wd("content", 0.85), wd("creator", 1.23, true), wd("or", 1.64), wd("a", 1.8), wd("social", 1.83), wd("media", 2.23), wd("influencer,", 2.56, true)],
  [wd("this", 3.4), wd("is", 3.76), wd("for", 3.94), wd("you.", 4.2, true)],
  [wd("Someone", 4.76), wd("built", 5.18), wd("an", 5.48), wd("app", 5.6, true), wd("whose", 5.8), wd("only", 6.23, true), wd("job", 6.57), wd("is", 6.84), wd("to", 7.0), wd("tell", 7.14), wd("you", 7.42), wd("what", 7.65), wd("to", 7.94), wd("post.", 8.09, true)],
  [wd("It's", 8.64), wd("called", 8.92), wd("SOCIA,", 9.35, true)],
  [wd("and", 9.85), wd("it's", 9.95), wd("coming", 10.13, true), wd("soon.", 10.42, true)],
  [wd("So", 10.8), wd("save", 10.96, true), wd("this", 11.25), wd("video.", 11.55)],
  [wd("Connect", 12.18), wd("Instagram,", 12.58), wd("Facebook,", 13.23), wd("YouTube", 13.84), wd("and", 14.6), wd("TikTok,", 14.96), wd("once.", 15.6, true)],
  [wd("It", 16.22), wd("reads", 16.38), wd("every", 16.75), wd("post,", 17.13), wd("finds", 17.6), wd("the", 17.88), wd("ones", 18.05), wd("that", 18.28), wd("beat", 18.44, true), wd("your", 18.64), wd("average", 18.88), wd("and", 19.32), wd("plans", 19.52), wd("your", 19.86), wd("whole", 20.13), wd("week.", 20.47, true)],
  [wd("It", 20.96), wd("builds", 21.11), wd("videos", 21.44), wd("from", 21.8), wd("your", 22.04), wd("clips,", 22.28, true), wd("rates", 22.72), wd("every", 23.05), wd("hook,", 23.38, true), wd("and", 23.78), wd("tells", 23.98), wd("you", 24.31), wd("what", 24.51), wd("to", 24.78), wd("fix.", 24.91, true)],
  [wd("Every", 25.36), wd("plan", 25.74), wd("lands", 26.04), wd("as", 26.42), wd("a", 26.57), wd("draft,", 26.64, true), wd("and", 27.04), wd("nothing", 27.25), wd("posts", 27.75), wd("until", 28.11), wd("you", 28.47, true), wd("say", 28.68), wd("so.", 28.89)],
  [wd("It", 29.29), wd("even", 29.42), wd("finds", 29.61), wd("your", 29.89), wd("best", 30.1, true), wd("time", 30.33, true), wd("to", 30.6), wd("post,", 30.82), wd("from", 31.28), wd("your", 31.53), wd("own", 31.78, true), wd("numbers.", 31.97)],
  [wd("Comment", 32.64), wd("early", 33.16, true), wd("access,", 33.53, true), wd("or", 34.0), wd("just", 34.11), wd("comment", 34.34), wd("SOCIA", 34.76, true), wd("to", 36.06), wd("get", 36.12), wd("in", 36.29), wd("early.", 36.41)],
  [wd("The", 37.0), wd("first", 37.2), wd("50", 37.54, true), wd("get", 37.95), wd("one", 38.15), wd("week", 38.35), wd("free.", 38.62, true)],
  [wd("Follow,", 39.16, true), wd("like,", 39.68, true), wd("and", 40.07), wd("share", 40.26, true), wd("this", 40.59), wd("with", 40.88), wd("a", 41.08), wd("friend", 41.13), wd("it", 41.43), wd("could", 41.53), wd("help.", 41.78)],
];

export type SceneKey = "intro" | "agent" | "name" | "link" | "connect" | "read" | "studio" | "draft" | "best" | "comment" | "fifty" | "share";

/** Scenes in order with their start time (the first word that opens them). */
export const SCENES: { key: SceneKey; at: number; label: string; ground: "dark" | "blue" }[] = [
  { key: "intro", at: 0, label: "// 00 · for you", ground: "dark" },
  { key: "agent", at: 4.76, label: "// 01 · the app", ground: "dark" },
  { key: "name", at: 8.64, label: "// 02 · the name", ground: "dark" },
  { key: "link", at: 9.85, label: "// 03 · coming soon", ground: "dark" },
  { key: "connect", at: 12.18, label: "// 04 · connect", ground: "dark" },
  { key: "read", at: 16.22, label: "// 05 · read + plan", ground: "blue" },
  { key: "studio", at: 20.96, label: "// 06 · content studio", ground: "blue" },
  { key: "draft", at: 25.36, label: "// 07 · your call", ground: "blue" },
  { key: "best", at: 29.29, label: "// 08 · best time", ground: "dark" },
  { key: "comment", at: 32.64, label: "// 09 · early access", ground: "dark" },
  { key: "fifty", at: 37.0, label: "// 10 · first 50", ground: "dark" },
  { key: "share", at: 39.16, label: "// 11 · pass it on", ground: "dark" },
];

/** The persistent dock: five tabs whose badges climb as the story goes. Each step is [time, value]. */
export const DOCK = {
  title: "// your social team",
  name: "SOCIA",
  tabs: [
    { key: "accounts", label: "Accounts", steps: [[12.58, 1], [13.23, 2], [13.84, 3], [14.96, 4]] },
    { key: "posts", label: "Posts", steps: [[16.38, 12], [16.75, 30], [17.13, 50]] },
    { key: "plan", label: "Plan", steps: [[19.52, 3], [19.86, 5], [20.47, 7]] },
    { key: "studio", label: "Studio", steps: [[22.28, 1], [22.72, 2], [23.38, 3]] },
    { key: "drafts", label: "Drafts", steps: [[26.64, 7]] },
  ] as { key: string; label: string; steps: [number, number][] }[],
  /** Status chip: [time, text]. */
  status: [
    [0, "STANDING BY"],
    [4.76, "BUILT"],
    [9.85, "COMING SOON"],
    [12.18, "CONNECTING"],
    [15.6, "CONNECTED"],
    [16.22, "READING"],
    [19.52, "PLANNING"],
    [20.96, "BUILDING"],
    [25.36, "WAITING FOR YOU"],
    [29.29, "TIMING"],
    [32.64, "READY"],
  ] as [number, string][],
};

/** Top-right counter per scene: label and a [time, value] ramp (value null = text only). */
export const COUNTERS: Record<SceneKey, { label: string; steps?: [number, number][]; text?: string }> = {
  intro: { label: "FOR", text: "CREATORS" },
  agent: { label: "GUESSES", text: "0" },
  name: { label: "NAME", text: "SOCIA" },
  link: { label: "LAUNCH", text: "COMING SOON" },
  connect: { label: "PLATFORMS", steps: [[12.18, 0], [12.58, 1], [13.23, 2], [13.84, 3], [14.96, 4]] },
  read: { label: "POSTS READ", steps: [[16.38, 0], [17.2, 50]] },
  studio: { label: "CUTS", steps: [[20.96, 0], [22.28, 1], [22.72, 2], [23.38, 3]] },
  draft: { label: "POSTED WITHOUT YOU", text: "0" },
  best: { label: "FROM", text: "YOUR NUMBERS" },
  comment: { label: "COMMENT", text: "SOCIA" },
  fifty: { label: "SPOTS", text: "50" },
  share: { label: "SEND TO", text: "A FRIEND" },
};

// An example creator (v3, 2026-10-29: Noah asked to stop using the pizzeria). These
// are illustrative and every panel that shows them carries an EXAMPLE chip; no
// growth claim is made from them.
export const TOP_POSTS = [
  { title: "Rating viral snacks, honestly", views: "102K", x: "8.4x", hue: "#8b5cf6" },
  { title: "POV: my first 5 AM run", views: "41K", x: "3.4x", hue: "#ec4899" },
  { title: "Day in my life (no filter)", views: "29K", x: "2.3x", hue: "#0ea5e9" },
  { title: "Story time: the wrong flight", views: "18K", x: "1.5x", hue: "#d97706" },
];
export const WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
/** Best time to post (example): days x time bands, the winning cell is lit. */
export const BEST = { day: 1, band: 3, label: "TUE · 7 PM", days: ["M", "T", "W", "T", "F", "S", "S"], bands: ["9 AM", "12 PM", "4 PM", "7 PM", "10 PM"] };
export const DRAFT = { when: "TUE · 7:00 PM", title: "Rating viral snacks, part 2", body: "You picked them. I tried them. Ranked from worst to best." };
export const RATER = [
  { id: "Hook", score: 5 },
  { id: "Pacing", score: 3 },
  { id: "Clarity", score: 4 },
  { id: "CTA", score: 2 },
];
export const SITE = "coming soon"; // the site is not ready yet (Noah, 2026-10-29)

/** Letters of "SOCIA" as the narrator spells them in the comment scene. */
export const SPELL: [string, number][] = [["S", 34.76], ["O", 35.02], ["C", 35.28], ["I", 35.54], ["A", 35.8]];
