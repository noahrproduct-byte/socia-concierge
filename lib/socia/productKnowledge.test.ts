// Keeps lib/socia/productKnowledge.ts in step with the app: a page it names must exist, and a plan it names
// must be the plan lib/plans.ts gates the feature behind. A change to either fails here until the
// assistant's knowledge is updated too.
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_MIN_PLAN } from "../plans";
import { FEATURES } from "./productKnowledge";

const APP = join(__dirname, "..", "..", "app", "(app)");

describe("SOCIA's product knowledge", () => {
  it("names only pages that exist", () => {
    for (const f of FEATURES) {
      if (!f.route) continue;
      expect({ feature: f.name, page: existsSync(join(APP, ...f.route.split("/").filter(Boolean), "page.tsx")) }).toEqual({ feature: f.name, page: true });
    }
  });

  it("states the same plan the app gates each feature behind", () => {
    for (const f of FEATURES) {
      if (!f.gate) continue;
      expect({ feature: f.name, plan: FEATURE_MIN_PLAN[f.gate.key] }).toEqual({ feature: f.name, plan: f.gate.plan });
    }
  });

  it("has no two features with the same name", () => {
    const names = FEATURES.map((f) => f.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
