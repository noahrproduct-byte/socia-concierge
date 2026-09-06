// Follower demographics from the Instagram API with Instagram Login.
// `follower_demographics` is a lifetime insight with a breakdown (age, gender,
// city, country). Meta only serves it for professional accounts with at least
// 100 followers; anything else comes back as an error we surface verbatim.

const IG_V = "v23.0";

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

async function breakdown(token: string, dim: "age" | "gender" | "city"): Promise<{ bars: DemoBar[]; error: string | null }> {
  const u = new URL(`https://graph.instagram.com/${IG_V}/me/insights`);
  u.searchParams.set("metric", "follower_demographics");
  u.searchParams.set("period", "lifetime");
  u.searchParams.set("timeframe", "this_month");
  u.searchParams.set("metric_type", "total_value");
  u.searchParams.set("breakdown", dim);
  u.searchParams.set("access_token", token);
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(7000), cache: "no-store" });
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
  } catch (e) {
    return { bars: [], error: e instanceof Error ? e.message : "Instagram couldn't be reached" };
  }
}

const GENDER_LABEL: Record<string, string> = { F: "Women", M: "Men", U: "Unspecified" };

export async function fetchDemographics(token: string | null): Promise<Demographics> {
  if (!token) return { status: "unavailable", reason: "Connect Instagram to see who follows you.", age: [], gender: [], city: [] };
  const [age, gender, city] = await Promise.all([breakdown(token, "age"), breakdown(token, "gender"), breakdown(token, "city")]);
  const ok = age.bars.length || gender.bars.length || city.bars.length;
  if (!ok) {
    return { status: "unavailable", reason: age.error ?? gender.error ?? city.error ?? "Instagram returned no demographics for this account.", age: [], gender: [], city: [] };
  }
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
