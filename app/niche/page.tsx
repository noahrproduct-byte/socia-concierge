import { redirect } from "next/navigation";

// Niche Trends now lives on the Competitors page — the two answered the same
// question ("what's working around me") from opposite ends, so they merged.
// This route stays as a redirect so bookmarks and old links keep working.
export default function NichePage() {
  redirect("/competitors#trends");
}
