import Link from "next/link";
import BrandMark from "@/components/BrandMark";

// Branded 404 — replaces Next's unstyled black default. Self-contained
// styles: this page must render even when nothing else does.
export default function NotFound() {
  return (
    <main className="nf-page">
      <style>{`
        .nf-page { min-height: 100vh; display: grid; place-items: center; background: #0b1220; color: #eef1f8;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; padding: 24px; text-align: center; }
        .nf-card { max-width: 440px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .nf-mark { display: block; margin-bottom: 6px; }
        .nf-mark img { border-radius: 24%; display: block; }
        .nf-code { font-size: 12px; font-weight: 750; letter-spacing: .18em; color: #7b8499; }
        .nf-card h1 { font-size: 26px; letter-spacing: -.4px; margin: 0; }
        .nf-card p { margin: 0 0 14px; font-size: 14.5px; line-height: 1.6; color: #a6afc3; }
        .nf-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .nf-btn { padding: 11px 20px; border-radius: 11px; font-size: 14px; font-weight: 650; text-decoration: none;
          background: #5b4bd6; color: #fff; box-shadow: 0 6px 18px rgba(91,75,214,.35); }
        .nf-btn.ghost { background: transparent; color: #a6afc3; border: 1px solid #223050; box-shadow: none; }
        .nf-btn:hover { filter: brightness(1.08); }
      `}</style>
      <div className="nf-card">
        <span className="nf-mark">
          <BrandMark size={46} />
        </span>
        <span className="nf-code">404</span>
        <h1>This page doesn&apos;t exist</h1>
        <p>The link may be old, or the page moved. Everything you need is still one click away.</p>
        <div className="nf-actions">
          <Link href="/" className="nf-btn">SOCIA home</Link>
          <Link href="/dashboard" className="nf-btn ghost">Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
