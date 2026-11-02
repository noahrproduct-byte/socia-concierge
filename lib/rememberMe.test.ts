import { describe, expect, it } from "vitest";
import { shouldForget } from "./rememberMe";

describe("remember me", () => {
  it("keeps a remembered session", () => {
    expect(shouldForget({})).toBe(false);
    expect(shouldForget({ forget: null, alive: null })).toBe(false);
  });
  it("keeps an unremembered session while the browser stays open", () => {
    expect(shouldForget({ forget: "1", alive: "1" })).toBe(false);
  });
  it("ends an unremembered session once the browser has closed", () => {
    expect(shouldForget({ forget: "1", alive: undefined })).toBe(true);
  });
});
