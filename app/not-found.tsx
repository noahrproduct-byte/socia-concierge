import Link from "next/link";
import type { Metadata } from "next";
import BrandMark from "@/components/BrandMark";

// Through metadata, not a <title> in the page: an inline one was outranked by
// the site default once the page loaded, so the tab read "SOCIA: …" again.
export const metadata: Metadata = { title: "Page not found | SOCIA" };

// The 404 page, in the site's own look: the page background and ink from the
// design tokens, the system buttons, the brand mark. It sits under the root
// layout, so the tokens are loaded; each value still carries a fallback so the
// page reads correctly if they aren't (QA-06, docs/qa/bug-report.md).
export default function NotFound() {
  return (
    <main className="nf-page">
      <style>{`
        .nf-page { min-height: 100vh; display: grid; place-items: center; padding: var(--sp-6, 24px) var(--sp-4, 16px);
          background: var(--ground, #f6f5f2); color: var(--ink, #111); text-align: center; }
        .nf-card { max-width: 440px; display: flex; flex-direction: column; align-items: center; gap: var(--sp-3, 12px); }
        .nf-card h1 { margin: 0; font-size: var(--fs-title, 24px); line-height: var(--lh-title, 30px); font-weight: var(--fw-semibold, 600); text-wrap: balance; }
        .nf-card p { margin: 0 0 var(--sp-2, 8px); color: var(--ink-2, #555); font-size: var(--fs-body, 14px); line-height: var(--lh-body, 20px); }
        .nf-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--sp-2, 8px); }
      `}</style>
      <div className="nf-card">
        <BrandMark size={40} />
        <h1>This page doesn&apos;t exist</h1>
        <p>The link may be old, or the page moved. Everything you need is still one click away.</p>
        <div className="nf-actions">
          <Link href="/dashboard" className="s-btn s-btn--primary">Go to Dashboard</Link>
          <Link href="/" className="s-btn s-btn--ghost">SOCIA home</Link>
        </div>
      </div>
    </main>
  );
}
