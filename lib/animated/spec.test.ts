import { describe, it, expect } from "vitest";
import { ACCENTS, COMPARE_TIMES, cleanSpec, counterTimeline, roundCount, compareCounter, compareStopAt, compareValueText, inkOn, inventsNumbers, numberTokens, palette, sceneFrames, specTimeline } from "./spec";

const SOURCE = "Hook: Three things to order on your first visit. Concept: our 3 house drinks under $5, open 7am.";

describe("animated spec cleaning", () => {
  it("keeps good scenes, puts the hook first and drops unknown types", () => {
    const s = cleanSpec({
      theme: "light", accent: ACCENTS[1],
      scenes: [
        { type: "point", text: "Start with the house latte", emphasis: "house latte" },
        { type: "hook", text: "Three things to order on your first visit", emphasis: "first visit" },
        { type: "banner", text: "nope" },
        { type: "list", title: "Our picks", items: ["Latte", "Cold brew", "Cardamom bun"] },
        { type: "cta", text: "Come say hi", sub: "Open from 7am" },
      ],
      caption: "Your first visit, sorted.", hashtags: ["#coffee", "first visit!"],
    }, SOURCE, { signoff: "Salvo's" })!;
    expect(s.scenes.map((x) => x.type)).toEqual(["hook", "point", "list", "cta"]);
    expect(s.theme).toBe("light");
    expect(s.accent).toBe(ACCENTS[1]);
    expect(s.signoff).toBe("Salvo's");
    expect(s.hashtags).toEqual(["coffee", "firstvisit"]);
  });

  it("drops any scene with a number, price or percentage the plan didn't contain", () => {
    const s = cleanSpec({ scenes: [
      { type: "hook", text: "Three drinks under $5" },
      { type: "point", text: "Rated 4.9 by 2,000 locals" },
      { type: "point", text: "Our 3 house drinks" },
      { type: "point", text: "Save 20% today" },
    ] }, SOURCE)!;
    expect(s.scenes.map((x) => ("text" in x ? x.text : ""))).toEqual(["Three drinks under $5", "Our 3 house drinks"]);
  });

  it("refuses a video without a hook or with nothing after it", () => {
    expect(cleanSpec({ scenes: [{ type: "point", text: "Hi" }, { type: "cta", text: "Follow" }] }, SOURCE)).toBeNull();
    expect(cleanSpec({ scenes: [{ type: "hook", text: "Hi" }] }, SOURCE)).toBeNull();
    expect(cleanSpec(null, SOURCE)).toBeNull();
  });

  it("removes em dashes, caps words, keeps emphasis only when it is in the line, and falls back to safe colours", () => {
    const s = cleanSpec({ theme: "neon", accent: "#123456", scenes: [
      { type: "hook", text: "Coffee — but better, and also much much much much faster than ever", emphasis: "tea" },
      { type: "list", title: "Only one", items: ["a"] },
      { type: "quote", text: "Best morning stop" },
    ] }, SOURCE)!;
    const hook = s.scenes[0] as { text: string; emphasis?: string };
    expect(hook.text).toBe("Coffee, but better, and also much much much much");
    expect(hook.emphasis).toBeUndefined();
    expect(s.scenes.map((x) => x.type)).toEqual(["hook", "quote"]);
    expect(s.theme).toBe("ink");
    expect(s.accent).toBe(ACCENTS[0]);
  });

  it("turns a second hook into a point and stops at six scenes", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ type: i < 2 ? "hook" : "point", text: `Line ${["a", "b", "c", "d", "e", "f", "g", "h", "i"][i]}` }));
    const s = cleanSpec({ scenes: many }, SOURCE)!;
    expect(s.scenes).toHaveLength(6);
    expect(s.scenes.filter((x) => x.type === "hook")).toHaveLength(1);
  });

  it("clears a caption that invents a number", () => {
    expect(cleanSpec({ scenes: [{ type: "hook", text: "A" }, { type: "point", text: "B" }], caption: "Join 500 happy regulars" }, SOURCE)!.caption).toBe("");
  });
});

describe("numbers", () => {
  it("reads numbers with their units and compares them to the source", () => {
    expect([...numberTokens("Under $5, open 7am, 20%!")]).toEqual(["$5", "7am", "20%"]);
    expect(inventsNumbers("open 7am", numberTokens(SOURCE))).toBe(false);
    expect(inventsNumbers("open 8am", numberTokens(SOURCE))).toBe(true);
  });
});

describe("timing and colour", () => {
  it("gives longer lines more time, within limits, and adds an end card only with a sign-off", () => {
    expect(sceneFrames({ type: "hook", text: "Hi" })).toBe(60);
    expect(sceneFrames({ type: "quote", text: Array(40).fill("word").join(" ") })).toBe(165);
    const spec = cleanSpec({ scenes: [{ type: "hook", text: "One two three" }, { type: "cta", text: "Follow for more" }] }, SOURCE)!;
    const t = specTimeline(spec);
    expect(t.starts).toEqual([0, t.frames[0]]);
    expect(t.total).toBe(t.frames[0] + t.frames[1]);
    expect(specTimeline({ ...spec, signoff: "Salvo's" }).total).toBe(t.total + 48);
  });

  it("picks readable text colours", () => {
    expect(inkOn("#FFFFFF")).toBe("#111111");
    expect(inkOn("#101012")).toBe("#FFFFFF");
    expect(palette({ theme: "accent", accent: "#F5A623" }).fg).toBe("#111111");
    expect(palette({ theme: "ink", accent: "#2F5BFF" }).markInk).toBe("#FFFFFF");
  });
});

describe("comparison template", () => {
  const SRC = "Hook: Same beans, three coffees. Concept: grind size changes the shot. Our double is 18 g in, 36 g out in 28 seconds.";
  const base = {
    format: "compare", theme: "accent", accent: ACCENTS[2],
    compare: {
      hook: { lines: ["Same beans. Same machine.", "Three different coffees."], key: "different" },
      turn: { lines: ["Only one thing changed:", "the grind."], key: "grind" },
      close: { lines: ["Grind sets the time.", "Time sets the taste."], key: "taste" },
      setup: "Double shot, 18 g in, 36 g out",
      format: "clock", unit: "",
      columns: [
        { label: "Too coarse", value: 12, stamp: "sour", tone: "neutral" },
        { label: "Just right", value: 28, stamp: "balanced", tone: "win" },
        { label: "Too fine", value: 45, stamp: "bitter", tone: "lose" },
      ],
      note: "Balanced is 25 to 30 seconds", question: "Which one did you get today?",
    },
    scenes: [], caption: "Grind changes everything.", hashtags: ["coffee"],
  };

  it("builds a comparison, forces a dark or light ground and upper-cases stamps", () => {
    const s = cleanSpec(base, SRC, { signoff: "Salvo's" })!;
    expect(s.compare).toBeTruthy();
    expect(s.scenes).toEqual([]);
    expect(s.theme).toBe("ink");
    expect(s.compare!.columns.map((c) => c.stamp)).toEqual(["SOUR", "BALANCED", "BITTER"]);
    expect(s.compare!.columns[1].tone).toBe("win");
    expect(specTimeline(s).total).toBe(600);
  });

  it("marks values the plan didn't contain as example numbers, and not when they're all in it", () => {
    expect(cleanSpec(base, SRC)!.compare!.illustrative).toBe(true);
    const real = { ...base, compare: { ...base.compare, format: "number", unit: "g", columns: [{ label: "In", value: 18, stamp: "", tone: "neutral" }, { label: "Out", value: 36, stamp: "", tone: "win" }] } };
    expect(cleanSpec(real, SRC)!.compare!.illustrative).toBe(false);
  });

  it("drops lines with invented numbers and refuses headlines that invent them", () => {
    const s = cleanSpec({ ...base, compare: { ...base.compare, note: "Balanced is 20 to 22 seconds", question: "Rated 4.9 by locals?" } }, SRC)!;
    expect(s.compare!.note).toBe("");
    expect(s.compare!.question).toBe("");
    const bad = cleanSpec({ ...base, compare: { ...base.compare, hook: { lines: ["Sold 500 cups", "in one day."], key: "" } }, scenes: [] }, SRC);
    expect(bad).toBeNull();
  });

  it("needs 2 to 4 usable columns with a top value above zero, else falls back to the words", () => {
    const one = { ...base, compare: { ...base.compare, columns: [base.compare.columns[0]] }, scenes: [{ type: "hook", text: "Same beans, three coffees" }, { type: "cta", text: "Come try it" }] };
    const s = cleanSpec(one, SRC)!;
    expect(s.compare ?? null).toBeNull();
    expect(s.scenes.map((x) => x.type)).toEqual(["hook", "cta"]);
    const zero = { ...base, compare: { ...base.compare, columns: base.compare.columns.map((c) => ({ ...c, value: 0 })) } };
    expect(cleanSpec(zero, SRC)).toBeNull();
    const five = cleanSpec({ ...base, compare: { ...base.compare, columns: [...base.compare.columns, ...base.compare.columns] } }, SRC)!;
    expect(five.compare!.columns).toHaveLength(4);
  });

  it("keeps the italic key only when it is in the second line", () => {
    const s = cleanSpec({ ...base, compare: { ...base.compare, turn: { lines: ["Only one thing changed:", "the grind."], key: "beans" } } }, SRC)!;
    expect(s.compare!.turn.key).toBe("");
  });

  it("counts together and stops each column at its value, slowing into the top one", () => {
    expect(compareCounter(0, 45)).toBe(0);
    expect(compareCounter(COMPARE_TIMES.runEnd, 45)).toBeCloseTo(45, 5);
    expect(compareCounter(30, 45)).toBeCloseTo(45, 5);
    const a = compareStopAt(12, 45), b = compareStopAt(28, 45), c = compareStopAt(45, 45);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeCloseTo(COMPARE_TIMES.runEnd, 5);
    for (const v of [12, 28, 41, 44]) expect(compareCounter(compareStopAt(v, 45), 45)).toBeCloseTo(v, 3);
  });

  it("shows values as m:ss or with the unit", () => {
    expect(compareValueText(28, "clock", "")).toBe("0:28");
    expect(compareValueText(95, "clock", "")).toBe("1:35");
    expect(compareValueText(4.5, "number", "$", 2)).toBe("$4.50");
    expect(compareValueText(1200, "number", "g")).toBe("1,200 g");
  });
});

describe("counter template", () => {
  const SRC = "Hook: One coffee a day adds up. Concept: our loyalty card, every 10th coffee free.";
  const H = (a: string, b: string, key = "") => ({ lines: [a, b], key });
  const base = {
    format: "counter", theme: "light", accent: ACCENTS[0],
    counter: {
      hook: H("One coffee a day.", "How much is that?", "How much"),
      close: H("Small habits", "add up fast.", "fast"),
      setup: "", measure: "Cups", format: "number", unit: "",
      rounds: [
        { label: "Round 1", title: "One week", value: 7, result: H("One week:", "7 cups.", "7 cups") },
        { label: "Round 2", title: "One month", value: 30, result: H("One month:", "30 cups.") },
        { label: "Round 3", title: "One year", value: 365, result: H("One year:", "365 cups.") },
      ],
      note: "", question: "How many did you have this week?",
    },
    scenes: [], caption: "", hashtags: [],
  };

  it("builds a counter whose results may use their own round's value", () => {
    const s = cleanSpec(base, SRC)!;
    expect(s.counter).toBeTruthy();
    expect(s.theme).toBe("light");
    expect(s.counter!.rounds.map((r) => r.value)).toEqual([7, 30, 365]);
    expect(s.counter!.rounds[0].result.key).toBe("7 cups");
    expect(s.counter!.illustrative).toBe(true);
  });

  it("drops a round whose result uses another round's number, and refuses fewer than 2 rounds", () => {
    const bad = { ...base, counter: { ...base.counter, rounds: [base.counter.rounds[0], { ...base.counter.rounds[1], result: H("One month:", "365 cups.") }] } };
    expect(cleanSpec(bad, SRC)).toBeNull();
    const one = cleanSpec({ ...base, counter: { ...base.counter, rounds: base.counter.rounds.slice(0, 2).concat([{ ...base.counter.rounds[2], value: 0 }]) } }, SRC)!;
    expect(one.counter!.rounds).toHaveLength(2);
  });

  it("is not illustrative when every value is in the plan", () => {
    const real = cleanSpec({ ...base, counter: { ...base.counter, rounds: [{ label: "", title: "Every visit", value: 1, result: H("One stamp", "per coffee.") }, { label: "", title: "Card full", value: 10, result: H("Ten stamps:", "one free coffee.") }] } }, "Collect 10 stamps for a free coffee, 1 stamp per coffee.")!;
    expect(real.counter!.illustrative).toBe(false);
  });

  it("times rounds longer as they go and counts with an ease in and out, then holds", () => {
    const tl = counterTimeline({ rounds: base.counter.rounds as never });
    const lens = tl.rounds.map((r) => r.end - r.start);
    expect(lens[0]).toBeLessThan(lens[1]);
    expect(lens[1]).toBeLessThan(lens[2]);
    expect(tl.rounds[1].start - tl.rounds[0].end).toBeCloseTo(0.8, 5);
    const r = tl.rounds[2];
    expect(roundCount(r.start, r, 365)).toBe(0);
    expect(roundCount(r.end - 0.5, r, 365)).toBeCloseTo(365, 5);
    expect(roundCount(r.end, r, 365)).toBeCloseTo(365, 5);
    const quarter = roundCount(r.start + (r.end - 0.5 - r.start) * 0.25, r, 365);
    expect(quarter).toBeLessThan(365 * 0.25);
    const spec = cleanSpec(base, SRC)!;
    expect(specTimeline(spec).total).toBe(Math.round(tl.total * 30));
  });
});
