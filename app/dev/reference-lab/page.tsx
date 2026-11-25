import { notFound } from "next/navigation";
import ReferenceLab from "@/components/studio/ReferenceLab";

export const metadata = { title: "Reference lab", robots: { index: false, follow: false } };

/** The Video editor's prompt and reference panel as if a Reel came from Discover (components/studio/ReferenceLab.tsx). Development only. */
export default function ReferenceLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ReferenceLab />;
}
