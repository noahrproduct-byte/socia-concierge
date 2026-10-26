import { Inter_Tight } from "next/font/google";
import Landing from "@/components/landing/Landing";

// The display cut of SOCIA's Inter, for the wordmark and the marketing
// headlines only; body text and the app stay on Inter (tokens.css --font-display).
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-inter-tight" });

export const metadata = {
  title: "SOCIA: know what to post next",
  description:
    "SOCIA reads your Instagram, Facebook, YouTube and TikTok accounts, builds a weekly plan from what worked, and helps you make, schedule and publish each post.",
};

export default function Home() {
  return (
    <div className={interTight.variable}>
      <Landing />
    </div>
  );
}
