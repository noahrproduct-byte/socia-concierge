"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SociaIntro from "@/components/intro/SociaIntro";
import "@/components/intro/intro.css";

// /intro is someone choosing to watch the film. On a device set to reduce
// motion it asks first instead of quietly showing the still version.
export default function IntroPreview({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"checking" | "ask" | "play" | "motion">("checking");

  useEffect(() => {
    setMode(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "ask" : "play");
  }, []);

  const leave = () => router.replace(next);

  if (mode === "ask") {
    return (
      <div className="intro-ask">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/socia-mark.png" alt="SOCIA" width={220} height={220} />
        <p>This device is set to reduce motion, so the intro shows as a still. The film has strands moving across the screen for about eight seconds.</p>
        <div>
          <button type="button" className="is-primary" onClick={() => setMode("motion")} autoFocus>
            Play the intro
          </button>
          <button type="button" onClick={leave}>
            Continue
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100dvh", background: "#000" }}>
      {mode !== "checking" && <SociaIntro motion={mode === "motion"} onDone={leave} />}
    </div>
  );
}
