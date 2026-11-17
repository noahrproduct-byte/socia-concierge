"use client";

// Last-resort error page: Next renders this only when the ROOT layout itself
// throws, so it replaces <html>/<body> entirely and cannot rely on the
// stylesheets or the fonts. Small and inline so it renders when everything
// else has failed, in the same look as app/error.tsx.

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <main
          style={{
            minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f4f1", color: "#17191d",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif", padding: "24px 16px", textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 440, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/socia-mark.png" alt="SOCIA" width={40} height={40} style={{ borderRadius: 10 }} />
            <h1 style={{ fontSize: 24, lineHeight: "30px", fontWeight: 600, margin: 0 }}>SOCIA didn&apos;t load</h1>
            <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: "20px", color: "#5f646c" }}>
              The problem is on SOCIA&apos;s side, not yours, and nothing you saved is lost. Reloading usually clears it.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "9px 16px", borderRadius: 6, fontSize: 14, lineHeight: "20px", fontWeight: 500, cursor: "pointer",
                border: "1px solid #17191d", background: "#17191d", color: "#fff", fontFamily: "inherit",
              }}
            >
              Reload
            </button>
            {error?.digest && <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: "16px", color: "#8a8f97" }}>If you contact us, give this reference: {error.digest}</p>}
          </div>
        </main>
      </body>
    </html>
  );
}
