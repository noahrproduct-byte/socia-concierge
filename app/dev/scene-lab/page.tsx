import { notFound } from "next/navigation";
import SceneLab from "@/components/studio/SceneLab";

export const metadata = { title: "Animated graphics lab", robots: { index: false, follow: false } };

/** A check page for the animated graphics (components/studio/SceneLab.tsx). Development only: production answers 404. */
export default function SceneLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SceneLab />;
}
