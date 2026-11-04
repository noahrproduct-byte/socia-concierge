import Link from "next/link";
import { BarChart3, CalendarDays, Layers } from "lucide-react";
import BrandMark from "./BrandMark";

// The split-screen wrapper shared by every auth page: the showcase on the
// left (Noah's reference, 2026-11-01, light since 2026-11-03), the form on
// the right. Each line
// on the left names something SOCIA really does.
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <Link href="/" className="brand-logo" aria-label="SOCIA home">
            <BrandMark size={40} />
            <span className="brand-word">SOCIA</span>
          </Link>

          <div className="brand-mid">
            <p className="brand-eyebrow">Your AI social strategist</p>
            <h2 className="brand-head">
              Know what to post
              <em>before you post it.</em>
            </h2>
            <p className="brand-sub">
              AI-powered content ideas, analytics, and strategy built for
              creators and brands that grow with purpose.
            </p>

            <ul className="brand-features">
              <li>
                <span className="bf-ico"><BarChart3 size={24} aria-hidden /></span>
                <div>
                  <b>Analyze your performance</b>
                  <small>See what&apos;s working and why.</small>
                </div>
              </li>
              <li>
                <span className="bf-ico"><Layers size={24} aria-hidden /></span>
                <div>
                  <b>Discover what&apos;s trending</b>
                  <small>Find relevant content and proven formats.</small>
                </div>
              </li>
              <li>
                <span className="bf-ico"><CalendarDays size={24} aria-hidden /></span>
                <div>
                  <b>Plan with purpose</b>
                  <small>Get a weekly plan built from your data.</small>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      <main className="auth-panel">
        <div className="auth-formcard">{children}</div>
      </main>
    </div>
  );
}

// A reusable Google "G" icon for the auth buttons.
export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.583c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.583 9 3.583Z"
      />
    </svg>
  );
}
