import { notFound } from "next/navigation";
import ViralLab from "@/components/dashboard/ViralLab";

export const metadata = { title: "Viral lab", robots: { index: false, follow: false } };

/** The Dashboard's "Going viral in your niche" and the appearance controls on fixture data (components/dashboard/ViralLab.tsx). Development only: production answers 404. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ViralLab />;
}
