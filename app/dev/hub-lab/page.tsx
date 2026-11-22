import { notFound } from "next/navigation";
import StudioMode from "@/components/studio/StudioMode";
import MakeChoice from "@/components/studio/MakeChoice";
import AnimateStudio from "@/components/studio/AnimateStudio";

export const metadata = { title: "Studio hub lab", robots: { index: false, follow: false } };

/** Content Studio's hub, the animate-or-edit choice and the Animate screen, without an account. Development only: production answers 404. */
export default async function HubLabPage({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { screen } = await searchParams;
  return (
    <div className="s-page">
      {screen === "animate" ? <AnimateStudio viewerId="lab" modeTabs={<StudioMode mode="animate" />} /> : <MakeChoice modeTabs={<StudioMode mode="make" />} />}
    </div>
  );
}
