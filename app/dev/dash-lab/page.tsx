import { notFound } from "next/navigation";
import DashLab from "@/components/dashboard/DashLab";

export const metadata = { title: "Dashboard lab", robots: { index: false, follow: false } };

/** The Dashboard on fixture data (components/dashboard/DashLab.tsx). Development and preview builds only: production answers 404. */
export default function DashLabPage() {
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview") notFound();
  return <DashLab />;
}
