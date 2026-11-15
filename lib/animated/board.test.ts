import { describe, expect, it } from "vitest";
import { atSeconds, boardTimeline, boardWords, cleanBoard, counterEnd, stampEnd, withOwnCta } from "./board";
import { EXAMPLE_BOARD } from "./board.example";
import { specTimeline, type AnimatedSpec } from "./spec";

describe("the storyboard", () => {
  const board = cleanBoard(EXAMPLE_BOARD, "190 cm 175 cm")!;
  it("keeps a well-formed board as written", () => {
    expect(board.phrases).toHaveLength(10);
    expect(board.figures.map((f) => f.id)).toEqual(["them", "you"]);
    expect(board.points).toHaveLength(7);
    expect(board.example).toBe("Example heights");
    expect(board.end.rows).toHaveLength(3);
  });
  it("times words at a speaking pace and ends on the card", () => {
    const tl = boardTimeline(board);
    expect(tl.phrases[0].start).toBeCloseTo(0.1, 1);
    expect(tl.phrases[1].start).toBeGreaterThan(1.4);
    expect(tl.phrases[1].start).toBeLessThan(2.2);
    expect(tl.total).toBeGreaterThan(18);
    expect(tl.total).toBeLessThan(30);
    expect(atSeconds(tl, { ph: 10, dt: 0 })).toBe(tl.card);
    expect(tl.phrases[0].words.find((w) => w.w === "beta.")?.em).toBe(true);
  });
  it("follows a voiceover's real word times when there is one", () => {
    const spoken = Array.from({ length: 60 }, (_, i) => i * 0.5);
    expect(boardTimeline(board, spoken).phrases[1].start).toBe(2);
  });
  it("sets the video's length from the board", () => {
    const spec = { board } as unknown as AnimatedSpec;
    expect(specTimeline(spec).total).toBe(Math.round(boardTimeline(board).total * 30));
  });
  it("drops what it can't draw and labels invented numbers", () => {
    const b = cleanBoard({
      phrases: [{ text: "It takes 40 tries", em: "" }, { text: "Then it goes", em: "" }, { text: "Try it", em: "" }],
      points: [{ name: "a", x: 5000, y: -20, draw: "weird", tone: "pink" }],
      figures: [{ id: "x", scale: 9, tone: "fg", keys: [{ at: { ph: 99, dt: 0 }, x: 1, y: 1, lean: 0, lh: "nope", rh: "a", lf: "", rf: "", o: 1 }] }],
      links: [{ figure: "ghost", hand: "lh", point: "a", label: "x", tone: "bad", from: { ph: 0, dt: 0 }, to: { ph: 1, dt: 0 } }],
      end: { eyebrow: "", title: ["Come in", "tonight"], rows: [{ icon: "chat", a: "Rated 4.9 by 300 people", b: "" }, { icon: "weird", a: "Order online", b: "link in bio" }] },
    }, "no numbers here")!;
    expect(b.example).toBe("Example numbers");
    expect(b.points[0]).toMatchObject({ x: 1080, y: 0, draw: "none", tone: "dim" });
    expect(b.figures[0].scale).toBe(1.15);
    expect(b.figures[0].keys[0]).toMatchObject({ lh: "", rh: "a" });
    expect(b.figures[0].keys[0].at.ph).toBe(3);
    expect(b.links).toHaveLength(0);
    expect(b.end.rows).toEqual([{ icon: "chat", a: "Order online", b: "link in bio" }]);
  });
  it("needs a story", () => expect(cleanBoard({ phrases: [{ text: "One", em: "" }] }, "")).toBeNull());
  it("gives the meaning check every line", () => expect(boardWords(board)).toContain("Their beta isn't your beta."));
});

import { jsonObject, readSpec, storyFromAnswer } from "./write";
import { STORY_SHAPE } from "./boardWrite";
describe("the writer's answer", () => {
  const answer = JSON.stringify({ board: EXAMPLE_BOARD, caption: "Read the route before you pull on.", hashtags: ["#bouldering", "climbing tips"] });
  it("becomes a storyboard video, end to end", () => {
    const out = storyFromAnswer(answer, "190 cm 175 cm", "Beta Twin");
    expect(out.why).toBeUndefined();
    expect(out.spec?.board?.phrases).toHaveLength(10);
    expect(out.spec?.scenes).toEqual([]);
    expect(out.spec?.caption).toBe("Read the route before you pull on.");
    expect(out.spec?.hashtags).toEqual(["bouldering", "climbingtips"]);
    expect(out.spec?.signoff).toBe("Beta Twin");
  });
  it("reads a fenced answer and a board written at the top level", () => {
    expect(storyFromAnswer("```json\n" + answer + "\n```", "190 cm 175 cm").spec?.board).toBeTruthy();
    expect(storyFromAnswer(JSON.stringify({ ...EXAMPLE_BOARD, caption: "x", hashtags: [] }), "190 cm 175 cm").spec?.board?.phrases).toHaveLength(10);
  });
  it("keeps phrases written as bare strings", () => {
    const out = storyFromAnswer(JSON.stringify({ board: { phrases: ["You guess what to post", "Every single week", "Read your own numbers"] }, caption: "", hashtags: [] }), "");
    expect(out.spec?.board?.phrases.map((p) => p.text)).toEqual(["You guess what to post", "Every single week", "Read your own numbers"]);
  });
  it("says why when there is no storyboard", () => {
    expect(storyFromAnswer("sorry, I can't", "").why).toBe("the answer was not JSON");
    expect(storyFromAnswer('{"caption":"x"}', "").why).toContain("no board");
    expect(storyFromAnswer('{"board":{"phrases":[{"text":"One","em":""}]}}', "").why).toContain("fewer than three");
  });
  it("drops a caption with a number the brand never wrote, but keeps the video", () => {
    const out = storyFromAnswer(JSON.stringify({ board: EXAMPLE_BOARD, caption: "Send 40% more routes.", hashtags: [] }), "190 cm 175 cm");
    expect(out.spec?.board).toBeTruthy();
    expect(out.spec?.caption).toBe("");
  });
  it("reads a storyboard video back from the wire", () => {
    const spec = storyFromAnswer(answer, "190 cm 175 cm", "Beta Twin").spec!;
    const back = readSpec(JSON.parse(JSON.stringify(spec)), JSON.stringify(spec));
    expect(back?.board?.phrases).toHaveLength(10);
    expect(back?.signoff).toBe("Beta Twin");
  });
  it("is read from plain JSON, a code fence or stray words around it", () => {
    expect(jsonObject('{"board":{"phrases":[]}}')).toEqual({ board: { phrases: [] } });
    expect(jsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(jsonObject('Here it is: {"a":{"b":2}} Done.')).toEqual({ a: { b: 2 } });
    expect(jsonObject("no json here")).toBeNull();
    expect(jsonObject('{"a": ')).toBeNull();
  });
  it("is told every block of the board", () => {
    for (const k of ["phrases", "chapters", "counter", "meter", "set", "points", "figures", "shapes", "tags", "markers", "stamps", "links", "cards", "sweep", "flash", "end"]) expect(STORY_SHAPE).toContain(`"${k}"`);
  });
});

describe("what stays on screen", () => {
  const at = (ph: number, dt = 0) => ({ ph, dt });
  const b = cleanBoard({
    phrases: ["You guess what to post", "Then wonder why it flopped", "Connect in a minute", "Click connect and allow", "It reads your own posts", "and plans your week"].map((text) => ({ text, em: "" })),
    chapters: [{ ph: 0, label: "Before" }, { ph: 2, label: "Connecting" }, { ph: 4, label: "Your plan" }],
    counter: { label: "Seconds", steps: [{ at: at(2, 0.4), value: 0 }, { at: at(3, 1), value: 60 }], goodAt: at(3, 1) },
    stamps: [{ text: "Guess", tone: "bad", x: 540, y: 600, at: at(1, 0.4) }, { text: "Scheduled", tone: "accent", x: 540, y: 600, at: at(5, 0.5) }],
    tags: [{ text: "Felt right", tone: "dim", x: 540, y: 400, from: at(0, 0.3), to: at(1, 0.2) }],
    cards: [{ title: "Next week", lines: ["Mon, something trending"], x: 540, y: 250, w: 860, from: at(0), to: at(2) }],
    end: { eyebrow: "Part 2 is next", title: ["Watch it plan", "a real account"], rows: [{ icon: "follow", a: "Follow for Part 2", b: "we run it on a real account" }, { icon: "follow", a: "Follow for Part 3", b: "approve and schedule" }] },
  }, "60 seconds, Part 2 and Part 3")!;
  const tl = boardTimeline(b);
  it("takes a stamp down when the next chapter starts", () => {
    expect(stampEnd(b, tl, 0)).toBe(tl.phrases[2].start);
    expect(stampEnd(b, tl, 1)).toBe(tl.card);
  });
  it("takes the counter down at the chapter after its last count", () => {
    expect(counterEnd(b, tl)).toBe(Math.max(tl.phrases[4].start, tl.phrases[3].start + 1 + 0.8));
    expect(counterEnd({ ...b, chapters: b.chapters.slice(0, 2) }, tl)).toBe(tl.card);
    expect(counterEnd({ ...b, counter: null }, tl)).toBe(0);
  });
  it("gives the check each caption with what is on the stage", () => {
    const w = boardWords(b).split("\n");
    expect(w.find((l) => l.startsWith("1."))).toContain('card "Next week"');
    expect(w.find((l) => l.startsWith("1."))).toContain('label "Felt right"');
    expect(w.find((l) => l.startsWith("2."))).toContain('stamp "Guess"');
    expect(w.find((l) => l.startsWith("3."))).not.toContain("Guess");
    expect(w.find((l) => l.startsWith("4."))).toContain('counter "Seconds" up to 60');
    expect(w.find((l) => l.startsWith("6."))).not.toContain("counter");
  });
  it("puts the account's own ask first on the ending card", () => {
    const e = withOwnCta(b, "Comment “EARLY ACCESS” for the link").end;
    expect(e.rows).toHaveLength(3);
    expect(e.rows[0]).toEqual({ icon: "chat", a: 'Comment "EARLY ACCESS" for the link', b: "" });
    expect(e.rows[1].a).toBe("Follow for Part 2");
  });
  it("leaves an ending that already asks for it, or for the same kind of thing", () => {
    const own = { ...b, end: { ...b.end, rows: [{ icon: "chat" as const, a: "Comment EARLY ACCESS", b: "for the link" }] } };
    expect(withOwnCta(own, "Comment “EARLY ACCESS” for the link")).toBe(own);
    const post = { ...b, end: { ...b.end, rows: [{ icon: "chat" as const, a: "Comment your handle", b: "Part 2 runs it on yours" }] } };
    expect(withOwnCta(post, "Comment “EARLY ACCESS” for the link")).toBe(post);
    expect(withOwnCta(b, null)).toBe(b);
  });
  it("splits a long ask over two lines and never adds an invented number", () => {
    const e = withOwnCta(b, "DM us the word PLAN and we will send you the whole week").end.rows[0];
    expect(e.icon).toBe("send");
    expect(e.a.length).toBeLessThanOrEqual(40);
    expect(e.b.length).toBeGreaterThan(0);
    expect(`${e.a} ${e.b}`).toBe("DM us the word PLAN and we will send you the whole week");
  });
});
