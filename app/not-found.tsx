import Link from "next/link";

// Branded 404 — replaces Next's unstyled black default. Self-contained
// styles: this page must render even when nothing else does.
export default function NotFound() {
  return (
    <main className="nf-page">
      <style>{`
        .nf-page { min-height: 100vh; display: grid; place-items: center; background: #0b1220; color: #eef1f8;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; padding: 24px; text-align: center; }
        .nf-card { max-width: 440px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .nf-mark { width: 46px; height: 46px; border-radius: 13px; display: grid; place-items: center;
          background: linear-gradient(135deg, #5b4bd6, #9c90ff); color: #fff; font-weight: 800; font-size: 22px; margin-bottom: 6px; }
        .nf-code { font-size: 12px; font-weight: 750; letter-spacing: .18em; color: #7b8499; }
        .nf-card h1 { font-size: 26px; letter-spacing: -.4px; margin: 0; }
        .nf-card p { margin: 0 0 14px; font-size: 14.5px; line-height: 1.6; color: #a6afc3; }
        .nf-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .nf-btn { padding: 11px 20px; border-radius: 11px; font-size: 14px; font-weight: 650; text-decoration: none;
          background: linear-gradient(135deg, #5b4bd6, #7b6cf6); color: #fff; box-shadow: 0 6px 18px rgba(123,108,246,.35); }
        .nf-btn.ghost { background: transparent; color: #a6afc3; border: 1px solid #223050; box-shadow: none; }
        .nf-btn:hover { filter: brightness(1.08); }
      `}</style>
      <div className="nf-card">
        <span className="nf-mark" aria-hidden>S</span>
        <span className="nf-code">404</span>
        <h1>This page doesn&apos;t exist</h1>
        <p>The link may be old, or the page moved. Everything you need is still one click away.</p>
        <div className="nf-actions">
          <Link href="/dashboard" className="nf-btn">Go to Dashboard</Link>
          <Link href="/" className="nf-btn ghost">SOCIA home</Link>
        </div>
      </div>
    </main>
  );
}
