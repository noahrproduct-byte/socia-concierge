import { afterEach, describe, expect, it, vi } from "vitest";
import { aiFailure } from "./anthropic";

// Routes answer with one sentence per failure kind; the log line is where the
// real cause shows (the expired key on 2026-11-05 only said "aren't configured").
describe("aiFailure", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs the route, the kind, the status and the provider's message", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    const err = Object.assign(new Error("401 {\"type\":\"error\",\"error\":{\"type\":\"authentication_error\",\"message\":\"invalid x-api-key\"}}"), { status: 401 });
    expect(aiFailure("studio/analyze", err)).toBe("no_key");
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[ai\] studio\/analyze no_key status=401: 401 .*invalid x-api-key/));
    vi.unstubAllEnvs();
  });

  it("keeps the line short and on one line", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    expect(aiFailure("strategy", new Error(`overloaded\n${"x".repeat(900)}`))).toBe("failed");
    const line = String(log.mock.calls[0][0]);
    expect(line).not.toContain("\n");
    expect(line.length).toBeLessThan(360);
    vi.unstubAllEnvs();
  });
});
