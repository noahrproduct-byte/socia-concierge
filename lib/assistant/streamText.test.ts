import { describe, expect, it } from "vitest";
import { partialStringField } from "./streamText";

describe("reading the answer while it is written", () => {
  it("returns nothing until the field starts, then the text so far", () => {
    expect(partialStringField('{"te', "text")).toBeNull();
    expect(partialStringField('{"text": "Your Re', "text")).toBe("Your Re");
    expect(partialStringField('{"text": "Done.", "observed": [', "text")).toBe("Done.");
  });
  it("decodes escapes, and waits on half an escape", () => {
    expect(partialStringField('{"text":"a \\"quote\\"\\nline', "text")).toBe('a "quote"\nline');
    expect(partialStringField('{"text":"caf\\u00e9 and', "text")).toBe("café and");
    expect(partialStringField('{"text":"half \\', "text")).toBe("half ");
    expect(partialStringField('{"text":"half \\u00', "text")).toBe("half ");
  });
});
