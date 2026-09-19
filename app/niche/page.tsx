import { redirect } from "next/navigation";

// Niche Trends now lives on the Competitors page — the two answered the same
// question ("what's working around me") from opposite ends, so they merged.
// This route stays as a redirect so bookmarks and old links keep working,
// query string included.
export default async function NichePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v != null) qs.set(k, v);
  }
  const q = qs.toString();
  redirect(`/competitors${q ? `?${q}` : ""}#trends`);
}
