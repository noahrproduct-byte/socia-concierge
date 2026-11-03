import { describe, expect, it, vi } from "vitest";
import { publicMessage } from "./dbError";

describe("publicMessage", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  it("passes SOCIA's own sentences through", () => {
    expect(publicMessage("t", new Error("That clip isn't ready to post."))).toBe("That clip isn't ready to post.");
  });
  it("hides database errors, which name tables and types", () => {
    const pg = Object.assign(new Error('invalid input syntax for type uuid: "abc"'), { code: "22P02", details: null, hint: null });
    expect(publicMessage("t", pg)).not.toMatch(/uuid/);
    expect(publicMessage("t", { message: "relation x does not exist", code: "42P01", details: "", hint: "" })).not.toMatch(/relation/);
  });
  it("hides storage and runtime errors", () => {
    expect(publicMessage("t", Object.assign(new Error("Bucket not found"), { __isStorageError: true }))).not.toMatch(/Bucket/);
    expect(publicMessage("t", new TypeError("Cannot read properties of undefined (reading 'id')"))).not.toMatch(/properties/);
    expect(publicMessage("t", undefined, "Fallback.")).toBe("Fallback.");
  });
});
