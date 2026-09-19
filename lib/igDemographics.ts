// Follower demographics from the Instagram API with Instagram Login.
// `follower_demographics` is a lifetime insight with a breakdown (age, gender,
// city, country). Meta only serves it for professional accounts with at least
// 100 followers; anything else comes back as an error we surface verbatim.
//
// The three Graph calls are cached per account for six hours (Next data
// cache). Meta's own answers, including "not available for this account", are
// cached; a transport failure (timeout, network) is not, so the next render
// tries again.

import { unstable_cache } from "next/cache";

const IG_V = "v23.0";
const TTL_S = 6 * 60 * 60;

export type DemoBar = { label: string; value: number; share: number };
export type Demographics = {
  status: "ok" | "unavailable";
  reason: string | null;
  age: DemoBar[];
  gender: DemoBar[];
  city: DemoBar[];
};

type InsightResp = {
  data?: { total_value?: { breakdowns?: { results?: { dimension_values?: string[]; value?: number }[] }[] } }[];
  error?: { message?: string; code?: number };
};

const NONE = (reason: string): Demographics => ({ status: "unavailable", reason, age: [], gender: [], city: [] });

/** A failure to reach Instagram at all, as opposed to an answer from it. */
class TransportError extends Error {}

async function breakdown(token: string, dim: "age" | "gender" | "city"): Promise<{ bars: DemoBar[]; error: string | null }> {
  const u = new URL(`https://graph.instagram.com/${IG_V}/me/insights`);
  u.searchParams.set("metric", "follower_demographics");
  u.searchParams.set("period", "lifetime");
  u.searchParams.set("timeframe", "this_month");
  u.searchParams.set("metric_type", "total_value");
  u.searchParams.set("breakdown", dim);
  u.searchParams.set("access_token", token);
  let res: Response;
  try {
    res = await fetch(u, { signal: AbortSignal.timeout(7000), cache: "no-store" });
  } catch {
    throw new TransportError("Instagram didn't respond in time. The breakdown retries on the next load.");
  }
  const j = (await res.json().catch(() => null)) as InsightResp | null;
  if (!j || j.error) return { bars: [], error: j?.error?.message ?? `Instagram returned ${res.status}` };
  const results = j.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  const rows = results
    .map((r) => ({ label: r.dimension_values?.[0] ?? "?", value: typeof r.value === "number" ? r.value : 0 }))
    .filter((r) => r.value > 0);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const bars = rows
    .sort((a, b) => b.value - a.value)
    .map((r) => ({ ...r, share: total ? r.value / total : 0 }));
  return { bars, error: null };
}

const GENDER_LABEL: Record<string, string> = { F: "Women", M: "Men", U: "Unspecified" };

async function fetchLive(token: string): Promise<Demographics> {
  const [age, gender, city] = await Promise.all([breakdown(token, "age"), breakdown(token, "gender"), breakdown(token, "city")]);
  const ok = age.bars.length || gender.bars.length || city.bars.length;
  if (!ok) return NONE(age.error ?? gender.error ?? city.error ?? "Instagram returned no demographics for this account.");
  // Age buckets read better in order; cities stay ranked by size.
  const ageOrder = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  return {
    status: "ok",
    reason: null,
    age: [...age.bars].sort((a, b) => ageOrder.indexOf(a.label) - ageOrder.indexOf(b.label)),
    gender: gender.bars.map((b) => ({ ...b, label: GENDER_LABEL[b.label] ?? b.label })),
    city: city.bars.slice(0, 6),
  };
}

// Both arguments are part of the (hashed) cache key: the account id scopes
// the entry, and the token makes a reconnect start a fresh entry. Neither is
// logged. A thrown TransportError leaves nothing in the cache.
const cachedDemographics = unstable_cache(
  async (igUserId: string, token: string) => fetchLive(token),
  ["ig-follower-demographics"],
  { revalidate: TTL_S },
);

export async function fetchDemographics(token: string | null, igUserId: string | null): Promise<Demographics> {
  if (!token) return NONE("Connect Instagram to see who follows you.");
  try {
    return await cachedDemographics(igUserId ?? "account", token);
  } catch (e) {
    return NONE(e instanceof TransportError ? e.message : "Instagram couldn't be reached. The breakdown retries on the next load.");
  }
}
