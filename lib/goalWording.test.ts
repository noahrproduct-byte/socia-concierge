import { describe, expect, it } from "vitest";
import { customerGoalFor } from "./goalWording";
import { CUSTOMER_GOALS, growthLines, mainGoalLabel, mainGoalsFor, normalizeGrowth } from "./growth";

describe("how the customer goal is worded for a brand", () => {
  it("an app gets users, a restaurant gets bookings or orders (Noah, 2026-11-16)", () => {
    expect(customerGoalFor({ texts: ["An app that tells you what to post next", "Business & Finance"] })).toBe("users");
    expect(customerGoalFor({ texts: ["Neighbourhood pizzeria", "Pizza", "Food & Restaurant"] })).toBe("bookings_orders");
    expect(customerGoalFor({ texts: ["Handmade jewellery store"] })).toBe("sales");
    expect(customerGoalFor({ texts: ["Wedding photographer"] })).toBe("clients");
  });
  it("goes by how the person said customers act, before any wording", () => {
    expect(customerGoalFor({ action: "sign_up", texts: ["Neighbourhood pizzeria"] })).toBe("users");
    expect(customerGoalFor({ action: "book", texts: ["An app for climbers"] })).toBe("bookings_orders");
    expect(customerGoalFor({ action: "buy_online", texts: [] })).toBe("sales");
  });
  it("lets the most specific description decide, and software win a mixed line", () => {
    expect(customerGoalFor({ texts: ["A food delivery app for restaurants"] })).toBe("users");
    expect(customerGoalFor({ texts: [null, "", "Climbing gym", "Sports & Fitness"] })).toBe("bookings_orders");
    // "appetizers" is not an app.
    expect(customerGoalFor({ texts: ["Appetizers and small plates restaurant"] })).toBe("bookings_orders");
  });
  it("stays on bookings or orders when nothing points anywhere", () => {
    expect(customerGoalFor({ texts: [] })).toBe("bookings_orders");
    expect(customerGoalFor({ texts: ["Lifestyle"] })).toBe("bookings_orders");
  });
  it("words the goal for the brand everywhere it is named", () => {
    expect(mainGoalsFor("users").find((m) => m.id === "bookings_orders")).toEqual({ id: "bookings_orders", label: "Get more users or sign-ups", metric: "signups" });
    expect(mainGoalsFor(null).find((m) => m.id === "bookings_orders")!.label).toBe("Increase bookings or orders");
    // Only the customer goal changes.
    expect(mainGoalsFor("users").filter((m) => m.id !== "bookings_orders")).toEqual(mainGoalsFor(null).filter((m) => m.id !== "bookings_orders"));
    expect(mainGoalLabel("bookings_orders", { customer_goal: "clients" })).toBe("Get more clients or enquiries");
    expect(mainGoalLabel("followers", { customer_goal: "users" })).toBe("Gain followers");
    expect(growthLines({ main_goal: "bookings_orders", customer_goal: "users" })).toContain("Main goal: Get more users or sign-ups");
    expect(normalizeGrowth({ customer_goal: "users" }).customer_goal).toBe("users");
    expect(normalizeGrowth({ customer_goal: "nonsense" }).customer_goal).toBeUndefined();
    expect(new Set(CUSTOMER_GOALS.map((c) => c.metric)).size).toBe(CUSTOMER_GOALS.length);
  });
});
