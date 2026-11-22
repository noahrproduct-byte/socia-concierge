import { notFound } from "next/navigation";
import PlanLab from "@/components/plan/PlanLab";

export const metadata = { title: "Planner lab", robots: { index: false, follow: false } };

/** The Planner on a fixture plan (components/plan/PlanLab.tsx). Development only: production answers 404. */
export default function PlanLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PlanLab />;
}
