import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUND_SECONDS } from "./spec";

// The animated templates play files made by scripts/animated-sfx.py. When the
// round lengths change, rerun the script so every round has its tick track.
const SFX = join(process.cwd(), "public/animated/sfx");

describe("animated sound files", () => {
  it("has the shared sounds and a tick track for every counter round length", () => {
    const names = ["stamp", "whoosh", "hit", "pop", "typing", "compare-run", ...Object.values(ROUND_SECONDS).flat().map((s) => `round-${String(s).replace(".", "_")}`)];
    for (const n of names) expect(existsSync(join(SFX, `${n}.mp3`)), `${n}.mp3`).toBe(true);
  });
});
