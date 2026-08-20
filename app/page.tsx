import { Geist } from "next/font/google";
import CinematicLanding from "@/components/CinematicLanding";

const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-display" });

export const metadata = {
  title: "SOCIA — Know what to post before you post it",
  description:
    "SOCIA analyzes your content, competitors, audience, and performance — then tells you what to create, why it should work, and when to publish it.",
};

export default function Landing() {
  return (
    <div className={geist.variable}>
      <CinematicLanding />
    </div>
  );
}
