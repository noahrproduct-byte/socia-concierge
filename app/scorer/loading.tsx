// app/scorer/loading.tsx
//
// Next.js renders this instantly while the server component fetches the session and
// profile, so the page never flashes blank. The skeleton mirrors the real layout —
// page head, dropzone, context fields, player and result cards — so nothing jumps
// when the content swaps in.

export default function ScorerLoading() {
  return (
    <div className="sk-wrap" aria-busy="true" aria-label="Loading the Video Scorer">
      <style>{`
        @keyframes skShimmer { to { background-position: 200% 0 } }
        @keyframes skIn { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform:none } }
        @keyframes skPulse { 0%,100% { opacity:.55 } 50% { opacity:.9 } }

        .sk-wrap { padding: 28px 32px; max-width: 1200px; margin: 0 auto;
                   animation: skIn .3s ease both; }

        .sk { border-radius: 8px; background:
                linear-gradient(90deg,
                  rgba(128,128,128,.10) 25%,
                  rgba(128,128,128,.20) 37%,
                  rgba(128,128,128,.10) 63%);
              background-size: 200% 100%;
              animation: skShimmer 1.4s ease-in-out infinite; }

        .sk-eyebrow { width: 120px; height: 11px; margin-bottom: 12px; }
        .sk-title   { width: 260px; height: 30px; margin-bottom: 12px; border-radius: 10px; }
        .sk-sub     { width: min(560px, 90%); height: 13px; }

        .sk-drop { margin-top: 26px; height: 150px; border-radius: 16px;
                   border: 1.5px dashed rgba(128,128,128,.28);
                   display: grid; place-items: center; gap: 10px; align-content: center; }
        .sk-drop-icon { width: 34px; height: 34px; border-radius: 50%;
                        background: rgba(128,128,128,.18); animation: skPulse 1.6s ease-in-out infinite; }
        .sk-drop-line { width: 230px; height: 12px; }
        .sk-drop-note { width: 150px; height: 10px; }

        .sk-context { display:grid; gap:14px; margin-top:18px; }
        @media (min-width: 860px) { .sk-context { grid-template-columns: 1.4fr 1fr; } }
        .sk-label { width: 180px; height: 11px; margin-bottom: 8px; }
        .sk-field { height: 78px; border-radius: 12px; }
        .sk-field.short { height: 58px; }

        .sk-layout { display:grid; gap:20px; margin-top:22px; align-items:start; }
        @media (min-width: 1040px) { .sk-layout { grid-template-columns: 300px 1fr; } }

        .sk-player { aspect-ratio: 9 / 14; border-radius: 14px; }
        .sk-strip { display:grid; grid-template-columns: repeat(4,1fr); gap:6px; margin-top:14px; }
        .sk-thumb { aspect-ratio: 1; border-radius: 8px; }

        .sk-cards { display:grid; gap:16px; }
        @media (min-width: 1240px) { .sk-cards { grid-template-columns: 1.35fr 1fr; } }
        .sk-card { border-radius: 16px; border: 1px solid rgba(128,128,128,.16);
                   padding: 20px; }

        .sk-top { display:flex; gap:18px; align-items:center; }
        .sk-ring { width: 96px; height: 96px; border-radius: 50%; flex:none; }
        .sk-verdict { flex:1; display:grid; gap:8px; }
        .sk-v1 { width: 70%; height: 14px; }
        .sk-v2 { width: 90%; height: 11px; }

        .sk-bars { margin-top: 20px; display:grid; gap:12px; }
        .sk-bar-row { display:flex; align-items:center; gap:10px; }
        .sk-bar-label { width: 54px; height: 10px; flex:none; }
        .sk-bar-track { flex:1; height: 8px; border-radius: 99px; }
        .sk-chart { margin-top: 22px; height: 168px; border-radius: 12px; }

        .sk-fix { display:flex; gap:12px; padding: 12px 0;
                  border-top: 1px solid rgba(128,128,128,.14); }
        .sk-fix:first-of-type { border-top: none; }
        .sk-fix-time { width: 44px; height: 20px; border-radius: 6px; flex:none; }
        .sk-fix-body { flex:1; display:grid; gap:7px; }
        .sk-fix-b1 { width: 34%; height: 11px; }
        .sk-fix-b2 { width: 88%; height: 10px; }

        /* Stagger so it reads as loading rather than a frozen grey page */
        .sk-stagger > * { animation: skIn .4s cubic-bezier(.22,1,.36,1) both; }
        .sk-stagger > *:nth-child(1) { animation-delay: .02s }
        .sk-stagger > *:nth-child(2) { animation-delay: .08s }
        .sk-stagger > *:nth-child(3) { animation-delay: .14s }
        .sk-stagger > *:nth-child(4) { animation-delay: .20s }

        @media (prefers-reduced-motion: reduce) {
          .sk, .sk-drop-icon, .sk-stagger > *, .sk-wrap { animation: none !important; }
          .sk { background: rgba(128,128,128,.14); }
        }
      `}</style>

      <div className="sk-stagger">
        <div>
          <div className="sk sk-eyebrow" />
          <div className="sk sk-title" />
          <div className="sk sk-sub" />
        </div>

        <div className="sk-drop">
          <div className="sk-drop-icon" />
          <div className="sk sk-drop-line" />
          <div className="sk sk-drop-note" />
        </div>

        <div className="sk-context">
          <div>
            <div className="sk sk-label" />
            <div className="sk sk-field" />
          </div>
          <div>
            <div className="sk sk-label" />
            <div className="sk sk-field short" />
          </div>
        </div>

        <div className="sk-layout">
          <aside>
            <div className="sk sk-player" />
            <div className="sk-strip">
              {Array.from({ length: 8 }).map((_, i) => (
                <div className="sk sk-thumb" key={i} />
              ))}
            </div>
          </aside>

          <div className="sk-cards">
            <div className="sk-card">
              <div className="sk-top">
                <div className="sk sk-ring" />
                <div className="sk-verdict">
                  <div className="sk sk-v1" />
                  <div className="sk sk-v2" />
                </div>
              </div>
              <div className="sk-bars">
                {["Hook", "Script", "Visual", "Audio"].map((k) => (
                  <div className="sk-bar-row" key={k}>
                    <div className="sk sk-bar-label" />
                    <div className="sk sk-bar-track" />
                  </div>
                ))}
              </div>
              <div className="sk sk-chart" />
            </div>

            <div className="sk-card">
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="sk-fix" key={i}>
                  <div className="sk sk-fix-time" />
                  <div className="sk-fix-body">
                    <div className="sk sk-fix-b1" />
                    <div className="sk sk-fix-b2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
