import { Geist, Inter_Tight } from "next/font/google";
import CinematicLanding from "@/components/CinematicLanding";
import Intro from "@/components/landing/Intro";
import { landingAssets } from "@/lib/landingAssets";

const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-display" });
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-inter-tight" });

export const metadata = {
  title: "SOCIA: know what to post before you post it",
  description:
    "SOCIA analyzes your content, competitors, audience, and performance, then tells you what to create, why it should work, and when to publish it.",
};

// The homepage: the cinematic intro (components/landing) in place of the
// original hero, then the original SOCIA landing page from its second
// section on (components/CinematicLanding).
export default function Landing() {
  const assets = landingAssets();
  return (
    <div className={`${geist.variable} ${interTight.variable}`}>
      <CinematicLanding intro={<Intro footage={assets.opening} />} />
    </div>
  );
}
