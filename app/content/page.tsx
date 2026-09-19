import { redirect } from "next/navigation";

// The Content page was folded into Analytics (Content Performance tab with
// the full post library). Old links land there, query string included, so
// /content?range=90 keeps its range.
export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v != null) qs.set(k, v);
  }
  const q = qs.toString();
  redirect(`/analytics${q ? `?${q}` : ""}#content`);
}
