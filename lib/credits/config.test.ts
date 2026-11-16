import { describe, it, expect } from "vitest";
import { ACTION_USD, CREDIT_USD, MARGIN, MONTHLY_CREDITS, actionCredits, creditsBuy, type CreditAction, GENERATION_MODELS, DEFAULT_MODEL, CLIP_TRANSCRIBE_USD_PER_MINUTE, clipCredits, clipCreditsKept, clipWorkDone, creditsForUsd, formatCredits, modelById } from "./config";
import { PLAN_ORDER, PLANS } from "@/lib/plans";

describe("credits config", () => {
  it("gives every plan monthly credits, more on each bigger plan", () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) expect(MONTHLY_CREDITS[PLAN_ORDER[i]]).toBeGreaterThanOrEqual(MONTHLY_CREDITS[PLAN_ORDER[i - 1]]);
    expect(MONTHLY_CREDITS.free).toBeGreaterThan(0);
  });

  it("keeps a full month of credits inside each paid plan's AI ceiling, with room for background work", () => {
    for (const p of PLAN_ORDER) {
      if (p === "free" || p === "scale") continue;
      const costUsd = (MONTHLY_CREDITS[p] * CREDIT_USD) / MARGIN;
      expect(costUsd).toBeLessThan(PLANS[p].aiSpendCapUsd);
      // ...and under 65% of the price, so a customer who spends every credit still leaves a margin.
      expect(costUsd).toBeLessThan(PLANS[p].priceMonthly * 0.65);
    }
  });

  it("prices every AI action at its cost with the margin, never below one credit", () => {
    for (const a of Object.keys(ACTION_USD) as CreditAction[]) {
      expect(actionCredits(a)).toBe(Math.max(1, Math.ceil((ACTION_USD[a] * MARGIN) / CREDIT_USD)));
    }
    expect(creditsBuy(1800)).toMatch(/^about \d+ video ratings, \d+ animated videos or \d+ Ask SOCIA questions$/);
  });

  it("prices clipping by whole source minutes with the margin", () => {
    expect(clipCredits(1)).toBe(Math.ceil((0.05 * MARGIN) / CREDIT_USD));
    expect(clipCredits(10.2)).toBe(clipCredits(11));
    expect(clipCredits(10, "clip_v2")).toBe(Math.ceil((10 * 0.05 * 1.25 * MARGIN) / CREDIT_USD));
    expect(clipCredits(0)).toBe(clipCredits(1));
  });

  it("turns a dollar cost into credits with the margin, never zero", () => {
    expect(creditsForUsd(1)).toBe(Math.ceil((1 * MARGIN) / CREDIT_USD));
    expect(creditsForUsd(0.094)).toBe(15);
    expect(creditsForUsd(0)).toBe(1);
  });

  it("keeps the curated list consistent: every kind has an endpoint, video has lengths, every default exists", () => {
    for (const m of GENERATION_MODELS) {
      for (const k of m.kinds) expect(m.endpoints[k], `${m.id} ${k} endpoint`).toBeTruthy();
      if (m.kinds.some((k) => k !== "text_to_image")) expect(m.durations?.length).toBeGreaterThan(0);
    }
    for (const [kind, id] of Object.entries(DEFAULT_MODEL)) expect(modelById(id)?.kinds).toContain(kind);
  });

  it("offers vertical video by default and never offers a vertical shape a model can't make", () => {
    expect(modelById(DEFAULT_MODEL.text_to_video)?.aspectRatios?.[0]).toBe("9:16");
    // Hailuo 2.3 Standard has a fixed 768p output with no shape setting.
    const hailuo = modelById("hailuo-2.3-standard")!;
    expect(hailuo.kinds).not.toContain("text_to_video");
    expect(hailuo.aspectRatios).toBeUndefined();
    // SOUL 2 takes 9:16, 16:9, 4:3, 3:4, 1:1, 2:3 and 3:2 (no 4:5).
    expect(modelById("soul-2-standard")!.aspectRatios).not.toContain("4:5");
  });

  it("formats credits", () => {
    expect(formatCredits(1)).toBe("1 credit");
    expect(formatCredits(6000)).toBe("6,000 credits");
  });
});

describe("credits kept when one of SOCIA's own clip jobs stops early", () => {
  it("reads how far the job got from its stage", () => {
    expect(clipWorkDone({ status: "queued", stage: null, provider: "socia" })).toBe("none");
    expect(clipWorkDone({ status: "processing", stage: "transcribing", provider: "socia" })).toBe("transcription");
    for (const stage of ["picking", "picking-run", "pick-retry", "pick-retry-2"]) expect(clipWorkDone({ status: "processing", stage, provider: "socia" })).toBe("all");
    expect(clipWorkDone({ status: "processing", stage: null, provider: "vizard" })).toBe("none");
  });

  it("keeps nothing before the video was sent, the transcription's cost after, and the price once picking began", () => {
    const price = clipCredits(60, "clip_v1", "socia");
    expect(clipCreditsKept(60, price, "none")).toBe(0);
    expect(clipCreditsKept(60, price, "transcription")).toBe(Math.ceil((60 * CLIP_TRANSCRIBE_USD_PER_MINUTE * MARGIN) / CREDIT_USD));
    expect(clipCreditsKept(60, price, "transcription")).toBeLessThan(price);
    expect(clipCreditsKept(60, price, "all")).toBe(price);
  });

  it("never keeps more than was spent", () => {
    expect(clipCreditsKept(600, 5, "transcription")).toBe(5);
    expect(clipCreditsKept(10, 0, "all")).toBe(0);
  });

  it("keeps at least what the transcription cost SOCIA", () => {
    for (const minutes of [1, 5, 60, 600]) expect(clipCreditsKept(minutes, 1e6, "transcription") * CREDIT_USD).toBeGreaterThanOrEqual(minutes * CLIP_TRANSCRIBE_USD_PER_MINUTE);
  });
});

describe("Pro's credits follow the price paid", () => {
  it("gives full-price Pro subscribers more, and launch-price or unknown ones the launch amount", async () => {
    const { planCredits, FULL_PRICE_CREDITS } = await import("./config");
    const { FULL_PRICE } = await import("@/lib/launch");
    expect(planCredits("pro", Math.round(FULL_PRICE.pro * 100))).toBe(FULL_PRICE_CREDITS.pro);
    expect(planCredits("pro", 4999)).toBe(MONTHLY_CREDITS.pro);
    expect(planCredits("pro", null)).toBe(MONTHLY_CREDITS.pro);
    expect(planCredits("starter", Math.round(FULL_PRICE.starter * 100))).toBe(MONTHLY_CREDITS.starter);
  });

  it("keeps a full month of full-price Pro credits under 65% of the full price", async () => {
    const { FULL_PRICE_CREDITS } = await import("./config");
    const { FULL_PRICE } = await import("@/lib/launch");
    expect(((FULL_PRICE_CREDITS.pro ?? 0) * CREDIT_USD) / MARGIN).toBeLessThan(FULL_PRICE.pro * 0.65);
  });

  it("sells the launch amounts until the launch ends, the full-price amounts after", async () => {
    const { creditsOnSale, FULL_PRICE_CREDITS } = await import("./config");
    const { LAUNCH_ENDS_AT } = await import("@/lib/launch");
    expect(creditsOnSale("pro", LAUNCH_ENDS_AT - 1)).toBe(MONTHLY_CREDITS.pro);
    expect(creditsOnSale("pro", LAUNCH_ENDS_AT)).toBe(FULL_PRICE_CREDITS.pro);
    expect(creditsOnSale("growth", LAUNCH_ENDS_AT)).toBe(MONTHLY_CREDITS.growth);
  });
});
