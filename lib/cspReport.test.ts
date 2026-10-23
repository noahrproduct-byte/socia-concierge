import { describe, expect, it } from "vitest";
import { parseCspReport } from "./cspReport";

describe("parseCspReport", () => {
  it("keeps the directive, the blocked origin and the page path, never a query string", () => {
    const body = JSON.stringify({ "csp-report": {
      "document-uri": "https://sociaos.com/api/auth/youtube/callback?code=SECRET-CODE&state=x",
      "effective-directive": "connect-src",
      "blocked-uri": "https://evil.example/collect?token=SECRET-TOKEN",
      "script-sample": "alert(SECRET)",
    } });
    const [v] = parseCspReport(body);
    expect(v).toEqual({ directive: "connect-src", blocked: "https://evil.example", page: "/api/auth/youtube/callback", disposition: "report" });
    expect(JSON.stringify(v)).not.toContain("SECRET");
  });
  it("reads the Reporting API format and the browser's keywords", () => {
    const body = JSON.stringify([
      { type: "csp-violation", body: { documentURL: "https://sociaos.com/studio", effectiveDirective: "script-src-elem", blockedURL: "inline", disposition: "report" } },
      { type: "deprecation", body: {} },
    ]);
    expect(parseCspReport(body)).toEqual([{ directive: "script-src-elem", blocked: "inline", page: "/studio", disposition: "report" }]);
  });
  it("ignores anything that isn't a report", () => {
    expect(parseCspReport("not json")).toEqual([]);
    expect(parseCspReport(JSON.stringify({ hello: 1 }))).toEqual([]);
  });
});
