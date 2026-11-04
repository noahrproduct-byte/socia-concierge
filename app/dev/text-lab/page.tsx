import { notFound } from "next/navigation";
import TextLab from "@/components/studio/TextLab";

export const metadata = { title: "Text presets lab", robots: { index: false, follow: false } };

/** A check page for text presets (components/studio/TextLab.tsx). Development only: production answers 404. */
export default function TextLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TextLab />;
}
