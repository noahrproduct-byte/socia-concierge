import { describe, expect, it } from "vitest";
import { atSeconds, boardTimeline, boardWords, cleanBoard } from "./board";
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
