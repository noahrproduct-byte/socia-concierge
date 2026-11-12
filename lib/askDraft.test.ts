import { describe, expect, it } from "vitest";
import { askAnswerSchema } from "./ask";

describe("Ask SOCIA writes what it's asked for", () => {
  it("every answer carries a draft slot for a full script, caption, hooks or reply", () => {
    expect(askAnswerSchema.required).toContain("draft");
    const draft = askAnswerSchema.properties.draft;
    expect(draft.properties.kind.enum).toEqual(["none", "script", "caption", "hooks", "reply", "other"]);
    expect(draft.required).toEqual(["kind", "title", "body"]);
  });
});
