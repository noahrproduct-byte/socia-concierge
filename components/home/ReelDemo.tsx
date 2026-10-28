"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

// The example Reel in the Content Studio section. Muted and looping; it starts
// on its own only when motion is allowed and the person has not asked to save
// data, and the button always lets them stop or start it.

export default function ReelDemo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduced || saveData) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.4 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };

  return (
    <div className="hm-reel">
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Example Reel: a latte being poured, shot on a phone"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button type="button" className="hm-reel-ctl" onClick={toggle} aria-label={playing ? "Pause the example Reel" : "Play the example Reel"}>
        {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
      </button>
    </div>
  );
}
