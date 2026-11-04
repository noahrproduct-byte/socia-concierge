import { notFound } from "next/navigation";
import StudioLab from "@/components/studio/StudioLab";

export const metadata = { title: "Studio lab", robots: { index: false, follow: false } };

/** Every Studio screen on fixture data (components/studio/StudioLab.tsx). Development only: production answers 404. */
export default function StudioLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StudioLab />;
}
