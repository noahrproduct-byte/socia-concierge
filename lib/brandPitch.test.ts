import { describe, expect, it } from "vitest";
import { ownCallToAction, pitchFromDetail, pitchLines } from "./brandPitch";
import { cleanSpec } from "./animated/spec";
import { specWords } from "./animated/write";
import type { BrandDetail } from "./profile";

describe("the brand's pitch", () => {
  it("finds the account's own call to action in its bio", () => {
    expect(ownCallToAction(["Scan the wall. Get beta that fits your body. Your body. Your beta. 🧗 👉 DM to enter waitlist"])).toBe("DM to enter waitlist");
    expect(ownCallToAction(["Pizza by the slice since 1998.", "Order online, link in bio! #pizza"])).toBe("Order online, link in bio");
    expect(ownCallToAction(["Just a climber."])).toBeNull();
    expect(ownCallToAction(["Stop guessing what to post. Comment \u201cEARLY ACCESS\u201d for the link. First 50 get a"])).toBe("Comment \u201cEARLY ACCESS\u201d for the link");
  });
  it("says what the brand is, sells and wants", () => {
    const detail = { growth: { main_goal: "bookings_orders", niche_path: { specific: "Pre-launch climbing app" }, understanding: { facts: [{ bio: "Scan the wall. 👉 DM to enter waitlist", standouts: [{ text: "The most advanced climbing buddy ever created.", format: "Reel", multiple: 1.7, metric: "views", value: 2089 }] }], visual: { about: { value: "An app that scans a bouldering wall and suggests beta that fits your body.", product: "BetaTwin app", confidence: 85, evidence: [] } } } } } as unknown as BrandDetail;
    const p = pitchFromDetail(detail, { name: "betatwin.app" });
    expect(p.converts).toBe(true);
    expect(p.cta).toBe("DM to enter waitlist");
    expect(p.what).toContain("scans a bouldering wall");
    expect(pitchLines(p).join("\n")).toContain("The owner's main goal: Increase bookings or orders");
  });
});

describe("the video's ending", () => {
  const raw = { format: "words", theme: "ink", accent: "#2F5BFF", scenes: [{ type: "hook", text: "Stuck on the same move", emphasis: "" }, { type: "cta", text: "Read it first", sub: "" }], caption: "", hashtags: [], cta: { line: "BetaTwin scans the wall and shows the beta that fits your body", action: "DM to enter the waitlist" } };
  it("keeps an ending that names the brand and asks for the goal", () => {
    const s = cleanSpec(raw, "brand betatwin")!;
    expect(s.cta).toEqual({ line: "BetaTwin scans the wall and shows the beta that fits your body", action: "DM to enter the waitlist" });
    expect(specWords(s)).toContain("Ending: BetaTwin scans the wall");
  });
  it("drops an ending that invents a number", () => {
    const s = cleanSpec({ ...raw, cta: { line: "BetaTwin gets you up 3x faster", action: "DM to join" } }, "brand betatwin")!;
    expect(s.cta).toBeNull();
  });
});
