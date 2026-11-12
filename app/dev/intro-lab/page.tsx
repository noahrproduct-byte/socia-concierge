import { notFound } from "next/navigation";
import IntroGate from "@/components/intro/IntroGate";

export const metadata = { title: "Intro lab", robots: { index: false, follow: false } };

/** The first-run film over a stand-in page, as a new account gets it (components/intro). Development only: production answers 404. */
export default function IntroLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1 id="under">The page under the intro</h1>
      <p>Skipping or finishing fades the film out onto this page. Reload: it does not play again in this browser.</p>
      <IntroGate userId="intro-lab" />
    </main>
  );
}
