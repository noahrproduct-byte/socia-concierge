"use client";

// The error page for the app. Next renders this when a route segment throws
// during render on the client or the server. It carries its own styles (it
// must render even when the rest of the app is broken), in the site's own
// look: the warm page ground, the brand mark, a black main action. It never
// shows the raw error to the person, only a retry and a way back. The digest
// is shown so a support request can be tied to a server log line.

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // In the browser console for debugging; never in the page.
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <main className="er-page">
      <style>{`
        .er-page { min-height: 100vh; display: grid; place-items: center; background: var(--ground, #f5f4f1); color: var(--ink, #17191d);
          font-family: var(--font-sans, ui-sans-serif), system-ui, -apple-system, sans-serif; padding: 24px 16px; text-align: center; }
        .er-card { max-width: 440px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .er-mark { width: 40px; height: 40px; border-radius: 10px; }
        .er-card h1 { font-size: 24px; line-height: 30px; font-weight: 600; margin: 0; text-wrap: balance; }
        .er-card p { margin: 0 0 8px; font-size: 14px; line-height: 20px; color: var(--ink-2, #5f646c); }
        .er-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
        .er-btn { padding: 9px 16px; border-radius: 6px; font: inherit; font-size: 14px; line-height: 20px; font-weight: 500; text-decoration: none; cursor: pointer;
          border: 1px solid var(--ink, #17191d); background: var(--ink, #17191d); color: var(--surface, #fff); }
        .er-btn.ghost { background: transparent; color: var(--ink, #17191d); border-color: var(--border-strong, #cfcfca); }
        .er-btn:focus-visible { outline: 2px solid var(--ink, #17191d); outline-offset: 2px; }
        .er-digest { margin-top: 8px; font-size: 12px; line-height: 16px; color: var(--ink-3, #8a8f97); }
      `}</style>
      <div className="er-card">
        {/* A plain <img>: the page must not depend on anything that could itself be what broke. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="er-mark" src="/brand/socia-mark.png" alt="SOCIA" width={40} height={40} />
        <h1>This page didn&apos;t load</h1>
        <p>The problem is on SOCIA&apos;s side, not yours, and nothing you saved is lost. Try again. It usually works the second time.</p>
        <div className="er-actions">
          {/* A full reload, not just a re-render: a tab left open through a deploy still runs the older code, and
              re-rendering that code fails the same way (2026-11-25: the crash was already fixed on the live site,
              and "Try again" kept failing in the old tab). The reload fetches the page and its code fresh. */}
          <button type="button" className="er-btn" onClick={() => { try { window.location.reload(); } catch { reset(); } }}>Try again</button>
          <Link href="/dashboard" className="er-btn ghost">Go to Dashboard</Link>
        </div>
        {error?.digest && <p className="er-digest">If you contact us, give this reference: {error.digest}</p>}
      </div>
    </main>
  );
}
