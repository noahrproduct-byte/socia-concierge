import { notFound } from "next/navigation";
import ImproveLab from "@/components/studio/ImproveLab";

export const metadata = { title: "Improve walkthrough lab", robots: { index: false, follow: false } };

/** A check page for the Improve walkthrough (components/studio/ImproveLab.tsx). Development only: production answers 404. */
export default function ImproveLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ImproveLab />;
}
