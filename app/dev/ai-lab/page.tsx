import { Suspense } from "react";
import { notFound } from "next/navigation";
import AiLab from "@/components/ai/AiLab";

export const metadata = { title: "AI lab", robots: { index: false, follow: false } };

/** The AI Clipper and AI Studio pages on fixture data (components/ai/AiLab.tsx). Development only: production answers 404. */
export default function AiLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Suspense fallback={null}><AiLab /></Suspense>;
}
