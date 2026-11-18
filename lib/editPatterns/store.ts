// The pattern library's storage: the study patterns ship with the code
// (seed.ts); the niche scan's patterns are saved per brand in edit_patterns
// (supabase/edit-patterns.sql), keyed by the same scope as the brand's playbook
// (lib/nicheScan/run.ts nicheScopeId), so one brand's competitor evidence never
// shows up for another. Server only.
import { studyPatterns } from "./seed";
import type { EditPattern } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const COLS = "key, source, niche, category, platform, technique, summary, characteristics, applies_to, evidence, observed, confidence, limitations, verified_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toPattern = (r: any): EditPattern => ({
  key: r.key, source: r.source, niche: r.niche, category: r.category, platform: r.platform, technique: r.technique, summary: r.summary,
  characteristics: r.characteristics ?? {}, appliesTo: r.applies_to ?? [], evidence: r.evidence ?? [], observed: r.observed ?? { reels: 0, accounts: 0, measured: 0, medianMultiplier: null },
  confidence: r.confidence, limitations: r.limitations ?? [], verifiedAt: r.verified_at,
});

const isMissingTable = (e: unknown) => /relation .* does not exist|PGRST205|Could not find the table/i.test((e as Error)?.message ?? String(e));

/**
 * Replaces a brand's scan patterns with this scan's. Best effort: before the
 * table exists, nothing is saved and the scan carries on.
 */
export async function saveScanPatterns(svc: Supa, scope: string, patterns: EditPattern[]): Promise<boolean> {
  try {
    const { error: delErr } = await svc.from("edit_patterns").delete().eq("scope", scope).eq("source", "scan");
    if (delErr) throw delErr;
    if (!patterns.length) return true;
    const rows = patterns.map((p) => ({
      scope, key: p.key, source: p.source, niche: p.niche, category: p.category, platform: p.platform, technique: p.technique, summary: p.summary,
      characteristics: p.characteristics, applies_to: p.appliesTo, evidence: p.evidence, observed: p.observed, confidence: p.confidence, limitations: p.limitations,
      verified_at: p.verifiedAt, updated_at: new Date().toISOString(),
    }));
    const { error } = await svc.from("edit_patterns").insert(rows);
    if (error) throw error;
    return true;
  } catch (e) {
    if (!isMissingTable(e)) console.error("[edit-patterns] save failed:", (e as Error)?.message ?? e);
    return false;
  }
}

/** A brand's library: its scan patterns (newest evidence first) and the study patterns. */
export async function loadPatterns(svc: Supa, scope: string | null): Promise<EditPattern[]> {
  let scanned: EditPattern[] = [];
  if (scope) {
    try {
      const { data, error } = await svc.from("edit_patterns").select(COLS).eq("scope", scope).order("verified_at", { ascending: false }).limit(40);
      if (error) throw error;
      scanned = (data ?? []).map(toPattern);
    } catch (e) {
      if (!isMissingTable(e)) console.error("[edit-patterns] load failed:", (e as Error)?.message ?? e);
    }
  }
  return [...scanned, ...studyPatterns()];
}
