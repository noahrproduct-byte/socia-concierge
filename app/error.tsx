"use client";

import Link from "next/link";
import BrandMark from "@/components/BrandMark";

// Branded error boundary for anything below the root layout. Self-contained
// styles like the 404 page: it must render when the page itself could not.
// The error object is deliberately never shown; reset() re-renders the route.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="err-page">
      <style>{`
        .err-page { min-height: 100vh; display: grid; place-items: center; background: #0b1220; color: #eef1f8;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; padding: 24px; text-align: center; }
        .err-card { max-width: 440px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .err-mark { display: block; margin-bottom: 6px; }
        .err-mark img { border-radius: 24%; display: block; }
        .err-code { font-size: 12px; font-weight: 750; letter-spacing: .18em; color: #7b8499; }
        .err-card h1 { font-size: 26px; letter-spacing: -.4px; margin: 0; }
        .err-card p { margin: 0 0 14px; font-size: 14.5px; line-height: 1.6; color: #a6afc3; }
        .err-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .err-btn { padding: 11px 20px; border-radius: 11px; font-size: 14px; font-weight: 650; text-decoration: none;
          font-family: inherit; cursor: pointer; border: 0;
          background: #5b4bd6; color: #fff; box-shadow: 0 6px 18px rgba(91,75,214,.35); }
        .err-btn.ghost { background: transparent; color: #a6afc3; border: 1px solid #223050; box-shadow: none; }
        .err-btn:hover { filter: brightness(1.08); }
      `}</style>
      <div className="err-card">
        <span className="err-mark">
          <BrandMark size={46} />
        </span>
        <span className="err-code">ERROR</span>
        <h1>Something went wrong on this page.</h1>
        <p>Try loading it again. If it keeps happening, your dashboard is one click away.</p>
        <div className="err-actions">
          <button type="button" className="err-btn" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/dashboard" className="err-btn ghost">Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
