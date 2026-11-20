import { describe, it, expect } from "vitest";
import { isGrammarTooLarge } from "./strictFormat";

describe("isGrammarTooLarge", () => {
  it("recognises Anthropic's refusal of a format that is too big", () => {
    expect(isGrammarTooLarge({ status: 400, message: "400 invalid_request_error The compiled grammar is too large, which would cause performance issues." })).toBe(true);
    expect(isGrammarTooLarge({ status: 400, error: { error: { message: "Schema is too complex for compilation." } } })).toBe(true);
  });
  it("leaves every other failure alone", () => {
    expect(isGrammarTooLarge({ status: 400, message: "Your credit balance is too low to access the Anthropic API." })).toBe(false);
    expect(isGrammarTooLarge({ status: 529, message: "compiled grammar is too large" })).toBe(false);
    expect(isGrammarTooLarge(null)).toBe(false);
  });
});
