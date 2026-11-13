"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SociaIntro from "@/components/intro/SociaIntro";
import { INTRO_COOKIE } from "@/lib/intro";
import "@/components/intro/intro.css";

// /intro is someone choosing to watch the film, so it starts from a Play
// button: that click is what lets the browser play the sound. On a device
// set to reduce motion it says so, and Play shows the moving film anyway.
export default function IntroPreview({ next }: { next: string }) {
  const router = useRouter();
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Having watched it here counts as having seen it: the homepage doesn't play it again.
  const leave = () => {
    document.cookie = `${INTRO_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    router.replace(next);
  };

  if (playing) {
    return (
      <div style={{ minHeight: "100dvh", background: "#000" }}>
        <SociaIntro motion onDone={leave} />
      </div>
    );
  }
  return (
    <div className="intro-ask">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/socia-mark.png" alt="SOCIA" width={220} height={220} />
      <p>
        {reduced
          ? "This device is set to reduce motion. The intro has strands moving across the screen for about twelve seconds, with sound."
          : "About twelve seconds, with sound."}
      </p>
      <div>
        <button type="button" className="is-primary" onClick={() => setPlaying(true)} autoFocus>
          Play the intro
        </button>
        <button type="button" onClick={leave}>
          Continue
        </button>
      </div>
    </div>
  );
}
