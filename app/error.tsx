"use client";

// Branded error boundary for the app. Next renders this when a route segment
// throws during render on the client or the server. Self-contained styles (it
// must render even when the rest of the app is broken) and it never shows the
// raw error to the person — just a way back and a retry. The digest is logged
// so a support request can be tied to a server log line.

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface it in the browser console for debugging; never to the UI.
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <main className="er-page">
      <style>{`
        .er-page { min-height: 100vh; display: grid; place-items: center; background: #0b1220; color: #eef1f8;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; padding: 24px; text-align: center; }
        .er-card { max-width: 460px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .er-mark { width: 46px; height: 46px; border-radius: 13px; display: grid; place-items: center;
          background: linear-gradient(135deg, #5b4bd6, #9c90ff); color: #fff; font-weight: 800; font-size: 22px; margin-bottom: 6px; }
        .er-code { font-size: 12px; font-weight: 750; letter-spacing: .18em; color: #7b8499; }
        .er-card h1 { font-size: 26px; letter-spacing: -.4px; margin: 0; }
        .er-card p { margin: 0 0 14px; font-size: 14.5px; line-height: 1.6; color: #a6afc3; }
        .er-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .er-btn { padding: 11px 20px; border-radius: 11px; font-size: 14px; font-weight: 650; text-decoration: none; cursor: pointer;
          border: none; background: linear-gradient(135deg, #5b4bd6, #7b6cf6); color: #fff; box-shadow: 0 6px 18px rgba(123,108,246,.35); }
        .er-btn.ghost { background: transparent; color: #a6afc3; border: 1px solid #223050; box-shadow: none; }
        .er-btn:hover { filter: brightness(1.08); }
        .er-digest { margin-top: 16px; font-size: 11px; color: #4c566e; letter-spacing: .04em; }
      `}</style>
      <div className="er-card">
        <span className="er-mark" aria-hidden>S</span>
        <span className="er-code">SOMETHING WENT WRONG</span>
        <h1>That didn&apos;t load</h1>
        <p>A hiccup on our end stopped this page from loading. Try again — it usually works the second time.</p>
        <div className="er-actions">
          <button type="button" className="er-btn" onClick={() => reset()}>Try again</button>
          <Link href="/dashboard" className="er-btn ghost">Go to Dashboard</Link>
        </div>
        {error?.digest && <p className="er-digest">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
