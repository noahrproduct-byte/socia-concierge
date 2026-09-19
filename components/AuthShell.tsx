import Link from "next/link";
import { Zap, Target, CalendarDays } from "lucide-react";
import BrandMark from "./BrandMark";

// The premium split-screen wrapper shared by every auth page:
// a branded showcase panel on the left, the form on the right.
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <Link href="/" className="brand-logo">
            <BrandMark size={44} />
            <span className="brand-word">
              SOCIA<em>Your AI Social Strategist</em>
            </span>
          </Link>

          <div className="brand-mid">
            <p className="brand-head">
              Know what to post
              <br />
              <span className="grad">before you post it.</span>
            </p>
            <p className="brand-sub">
              AI-powered content ideas, scoring, and scheduling, built for
              creators and brands that grow on purpose.
            </p>

            <ul className="brand-features">
              <li>
                <span className="bf-ico"><Zap size={16} /></span>
                <div>
                  <b>Audit any account in seconds</b>
                  <small>Instant insights and performance score.</small>
                </div>
              </li>
              <li>
                <span className="bf-ico"><Target size={16} /></span>
                <div>
                  <b>See what competitors are winning with</b>
                  <small>Spot opportunities before they peak.</small>
                </div>
              </li>
              <li>
                <span className="bf-ico"><CalendarDays size={16} /></span>
                <div>
                  <b>Get a full week of posts, hooks included</b>
                  <small>Done-for-you content you can publish.</small>
                </div>
              </li>
            </ul>

            <div className="score-card">
              <div className="score-left">
                {/* Illustrative card: labelled so the numbers are not read as a real score. */}
                <span className="mock-example">Example</span>
                <div className="score-top">
                  <span>Content Score</span>
                  <span className="score-badge">Great</span>
                </div>
                <div className="score-num">
                  87<small>/100</small>
                </div>
                <div className="score-bars">
                  <Bar label="Hook" value={92} />
                  <Bar label="Retention" value={85} />
                  <Bar label="Relevance" value={88} />
                </div>
              </div>
              <svg className="score-chart" viewBox="0 0 200 150" preserveAspectRatio="none" aria-hidden>
                {[40, 80, 120, 160].map((x) => (
                  <line key={x} x1={x} y1="10" x2={x} y2="145" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                ))}
                <path
                  d="M4,138 L26,120 L44,126 L66,96 L84,102 L104,78 L122,84 L142,58 L158,44 L176,30 L188,18"
                  fill="none"
                  stroke="#2563ff"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle cx="188" cy="18" r="8" fill="rgba(96,165,250,0.25)" />
                <circle cx="188" cy="18" r="3.5" fill="#8ab4ff" />
              </svg>
            </div>
          </div>

          <div className="brand-foot">© 2026 SOCIA</div>
        </div>
      </aside>

      <main className="auth-panel">
        <div className="auth-formcard">{children}</div>
      </main>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="bar-val">{value}</span>
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
