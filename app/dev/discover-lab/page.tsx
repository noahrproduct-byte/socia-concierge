import { notFound } from "next/navigation";
import FeedLab from "@/components/discover/FeedLab";

export const metadata = { title: "Discover feed lab", robots: { index: false, follow: false } };

/** Discover's two Reel feeds on made-up Reels (components/discover/FeedLab.tsx). Development only: production answers 404. */
export default function DiscoverLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FeedLab />;
}
