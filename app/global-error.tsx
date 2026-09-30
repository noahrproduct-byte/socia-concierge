"use client";

// Last-resort boundary: Next renders this only when the ROOT layout itself
// throws, so it replaces <html>/<body> entirely and cannot rely on globals.css
// or the theme provider. Kept deliberately tiny and inline so it renders when
// everything else has failed.

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
            minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b1220", color: "#eef1f8",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif", padding: 24, textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 440, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <span
              aria-hidden
              style={{
                width: 46, height: 46, borderRadius: 13, display: "grid", placeItems: "center", marginBottom: 6,
                background: "linear-gradient(135deg, #5b4bd6, #9c90ff)", color: "#fff", fontWeight: 800, fontSize: 22,
              }}
            >
              S
            </span>
            <h1 style={{ fontSize: 26, letterSpacing: "-.4px", margin: 0 }}>Something went wrong</h1>
            <p style={{ margin: "0 0 14px", fontSize: 14.5, lineHeight: 1.6, color: "#a6afc3" }}>
              SOCIA hit an unexpected error. Reloading usually clears it.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "11px 20px", borderRadius: 11, fontSize: 14, fontWeight: 650, cursor: "pointer", border: "none",
                background: "linear-gradient(135deg, #5b4bd6, #7b6cf6)", color: "#fff", boxShadow: "0 6px 18px rgba(123,108,246,.35)",
              }}
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
