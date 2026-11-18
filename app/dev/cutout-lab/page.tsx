import { notFound } from "next/navigation";
import CutoutLab from "@/components/studio/CutoutLab";

export const metadata = { title: "Cut-out lab", robots: { index: false, follow: false } };

/** A check page for the presenter cut-out (components/studio/CutoutLab.tsx). Development only: production answers 404. */
export default function CutoutLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CutoutLab />;
}
