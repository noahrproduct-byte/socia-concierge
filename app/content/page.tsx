import { redirect } from "next/navigation";

// The Content page folded into Analytics → "All posts". Old links land there.
export default function ContentRedirect() {
  redirect("/analytics#posts");
}
