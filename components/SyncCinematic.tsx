"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, Camera } from "lucide-react";

// The premium connect moment: plays once right after Instagram OAuth lands the
// user back on the dashboard. Three acts — link, scan, reveal — then fades out
// to uncover the live dashboard already rendered underneath.

type Act = "link" | "scan" | "done" | "exit";

export default function SyncCinematic({
  username,
  followers,
}: {
  username?: string | null;
  followers?: number | null;
}) {
  const router = useRouter();
  const [act, setAct] = useState<Act>("link");
  const [row, setRow] = useState(0);
  const reduced = useRef(false);

  const rows = useMemo(
    () => [
      username ? `Account found: @${username}` : "Account found",
      followers != null
        ? `Counting followers · ${followers.toLocaleString()}`
        : "Counting your followers",
      "Scanning your recent posts",
      "Measuring what performs",
      "Calibrating your strategy",
    ],
    [username, followers],
  );

  useEffect(() => {
    reduced.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const t: ReturnType<typeof setTimeout>[] = [];
    const fast = reduced.current;

    // Act 1 → 2
    t.push(setTimeout(() => setAct("scan"), fast ? 200 : 1700));
    // Scan rows tick
    const scanStart = fast ? 300 : 1900;
    const step = fast ? 60 : 620;
    for (let i = 1; i <= rows.length; i++) {
      t.push(setTimeout(() => setRow(i), scanStart + i * step));
    }
    // Act 2 → 3
    const doneAt = scanStart + (rows.length + 1) * step + (fast ? 100 : 300);
    t.push(setTimeout(() => setAct("done"), doneAt));
    // Act 3 → exit (fade), then clean the URL so it never replays
    t.push(setTimeout(() => setAct("exit"), doneAt + (fast ? 600 : 2600)));
    t.push(
      setTimeout(() => {
        router.replace("/dashboard");
      }, doneAt + (fast ? 900 : 3250)),
    );
    return () => t.forEach(clearTimeout);
  }, [router, rows.length]);

  function skip() {
    router.replace("/dashboard");
  }

  return (
    <div className={`sync-cine ${act === "exit" ? "exit" : ""}`} role="status" aria-live="polite">
      <div className="sc-aurora" aria-hidden />
      <button className="sc-skip" onClick={skip}>Skip</button>

      {act === "link" && (
        <div className="sc-stage">
          <div className="sc-link">
            <span className="sc-node sc-node-socia"><span className="side-mark">S</span></span>
            <span className="sc-beam" aria-hidden>
              <i /><i /><i />
            </span>
            <span className="sc-node sc-node-ig"><Camera size={22} /></span>
          </div>
          <h2 className="sc-title">Connecting to Instagram…</h2>
          <p className="sc-sub">Securing your account link</p>
        </div>
      )}

      {act === "scan" && (
        <div className="sc-stage">
          <div className="sc-orb">
            <span className="sc-orb-core" />
            <span className="sc-orb-ring r1" />
            <span className="sc-orb-ring r2" />
            <span className="sc-scanline" />
            <Sparkles size={26} className="sc-orb-ico" />
          </div>
          <h2 className="sc-title">AI is scanning your account</h2>
          <div className="sc-rows">
            {rows.map((r, i) => (
              <div key={r} className={`sc-row ${i < row ? "done" : ""} ${i === row ? "active" : ""}`}>
                <span className="sc-row-dot">
                  {i < row ? <Check size={13} /> : <span className="sc-row-spin" />}
                </span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(act === "done" || act === "exit") && (
        <div className="sc-stage">
          <div className="sc-burst">
            <span className="sc-burst-ring ring1" />
            <span className="sc-burst-ring ring2" />
            <span className="sc-burst-ring ring3" />
            <span className="sc-burst-core"><Check size={34} strokeWidth={3} /></span>
            <span className="sc-p p1" /><span className="sc-p p2" /><span className="sc-p p3" />
            <span className="sc-p p4" /><span className="sc-p p5" /><span className="sc-p p6" />
          </div>
          <h2 className="sc-title big">
            {username ? <>@{username} is live</> : <>You&apos;re live</>}
          </h2>
          <p className="sc-sub">Your real numbers are on the dashboard. Welcome to SOCIA.</p>
        </div>
      )}
    </div>
  );
}
