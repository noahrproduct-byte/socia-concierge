import { redirect } from "next/navigation";

// The Content page was folded into Analytics (Content Performance tab with
// the full post library). Old links land there.
export default function ContentPage() {
  redirect("/analytics#content");
}
