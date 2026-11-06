import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Claude's structured outputs answer 400 to a JSON schema using these, and the
// callers fall back quietly: captions became the clip's title and AI Studio's
// ideas failed every time. Limits belong in code after the answer comes back.
const UNSUPPORTED = /\b(maxItems|maxLength|minLength|minimum|maximum|multipleOf|exclusiveMinimum|exclusiveMaximum|pattern|uniqueItems):\s*[\d"/]|\bminItems:\s*[2-9]/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("JSON schemas sent to Claude", () => {
  it("use nothing structured outputs refuses", () => {
    const bad: string[] = [];
    for (const file of [...sources("lib"), ...sources("app")]) {
      const text = readFileSync(file, "utf8");
      // A schema here: objects closed with additionalProperties, as every Claude schema must be.
      if (!text.includes("additionalProperties: false")) continue;
      text.split("\n").forEach((line, i) => { if (UNSUPPORTED.test(line)) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`); });
    }
    expect(bad).toEqual([]);
  });
});
