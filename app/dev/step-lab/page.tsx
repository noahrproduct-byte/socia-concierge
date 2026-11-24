import { notFound } from "next/navigation";
import StepLab from "@/components/plan/StepLab";

export const metadata = { title: "Step plan lab", robots: { index: false, follow: false } };

/** The plan built one day at a time, on a made-up plan (components/plan/StepLab.tsx). Development only: production answers 404. */
export default function StepLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StepLab />;
}
