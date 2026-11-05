// Noah's judged clips (docs/clipper/examples.json), for the clip picker.
// Up to 12, good and bad mixed so the picker sees both sides.
import raw from "@/docs/clipper/examples.json";
import type { ClipExample } from "./pick";

const MAX = 12;

export function clipExamples(): ClipExample[] {
  const all = (raw as unknown[]).filter((e): e is ClipExample => {
    const x = e as Partial<ClipExample>;
    return (x.verdict === "good" || x.verdict === "bad") && typeof x.transcript === "string" && typeof x.why === "string" && Number.isFinite(x.seconds);
  });
  const good = all.filter((e) => e.verdict === "good");
  const bad = all.filter((e) => e.verdict === "bad");
  const out: ClipExample[] = [];
  for (let i = 0; out.length < MAX && (i < good.length || i < bad.length); i++) {
    if (good[i]) out.push(good[i]);
    if (bad[i] && out.length < MAX) out.push(bad[i]);
  }
  return out;
}
