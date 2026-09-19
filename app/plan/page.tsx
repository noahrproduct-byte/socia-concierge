import { redirect } from "next/navigation";

// The Content Plan lives at /tool. This alias catches old links, bookmarks
// and guesses at the obvious URL, instead of dead-ending on a 404.
export default function PlanAlias() {
  redirect("/tool");
}
