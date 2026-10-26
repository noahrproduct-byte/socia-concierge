import BrandMark from "@/components/BrandMark";

// The intelligence engine, as the live site showed it: account health,
// competitor intelligence, the recommendation engine, the video scorer and
// smart scheduling, now as one SOCIA screen in the app's own light theme.
// Illustrative throughout: the figures show what each panel reports, not a
// real account, and the frame says so.

function Ring({ value }: { value: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="lp-ring" aria-hidden="true">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--chart-grid)" strokeWidth="8" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--ink)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 50 50)" />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="lp-ring-num">{value}</text>
    </svg>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="lp-bar">
      <span>{label}</span>
      <span className="lp-bar-track"><span style={{ width: `${value}%` }} /></span>
      <b>{value}</b>
    </div>
  );
}

export default function EngineFrame() {
  return (
    <div className="lp-screen" data-theme="light" role="img" aria-label="Example: the SOCIA engine, with account health, competitors, a recommendation, the video scorer and smart scheduling">
      <div className="lp-screen-top">
        <BrandMark size={18} />
        <b>Dashboard</b>
        <span>Instagram, last 7 days</span>
        <em className="lp-example">Example data</em>
      </div>
      <div className="lp-screen-body lp-engine">
        <div className="lp-panel">
          <p className="lp-panel-label">Account health</p>
          <div className="lp-health">
            <Ring value={92} />
            <div>
              <b className="lp-health-word">Strong</b>
              <span className="lp-health-delta">+12 vs last week</span>
              <Bar label="Hook strength" value={91} />
              <Bar label="Posting consistency" value={84} />
              <Bar label="Topic concentration" value={76} />
              <Bar label="Engagement efficiency" value={88} />
            </div>
          </div>
        </div>

        <div className="lp-panel">
          <p className="lp-panel-label">Competitor intelligence</p>
          <ul className="lp-rows">
            <li><b>Bakery across town</b><span>+31% momentum</span></li>
            <li><b>Café near campus</b><span>2 outlier posts this week</span></li>
            <li><b>Roastery downtown</b><span>Educational Reels gaining</span></li>
          </ul>
        </div>

        <div className="lp-panel is-wide">
          <p className="lp-panel-label">Recommendation</p>
          <p className="lp-rec"><b>Publish another educational Reel this week.</b> Your educational videos are getting 2.4× your average engagement.</p>
          <ul className="lp-rows is-inline">
            <li><span>Hook demand</span><b>Strong</b></li>
            <li><span>Audience interest</span><b>Rising</b></li>
            <li><span>Timing</span><b>Thu 6:40pm</b></li>
            <li><span>Competitor saturation</span><b>Low</b></li>
          </ul>
        </div>

        <div className="lp-panel">
          <p className="lp-panel-label">Video scorer</p>
          <Bar label="Hook" value={91} />
          <Bar label="Retention" value={78} />
          <Bar label="Clarity" value={86} />
          <Bar label="Pacing" value={74} />
          <p className="lp-panel-foot"><b>Overall 84.</b> A score is a forecast, not a promise.</p>
        </div>

        <div className="lp-panel">
          <p className="lp-panel-label">Smart scheduling</p>
          <ul className="lp-week" aria-label="A week, with the best windows marked">
            {[["M", null], ["T", "6:20pm"], ["W", null], ["T", "6:40pm"], ["F", null], ["S", "11:15am"], ["S", null]].map(([d, t], i) => (
              <li key={i} className={t ? "is-best" : undefined}><span>{d}</span>{t && <small>{t}</small>}</li>
            ))}
          </ul>
          <p className="lp-panel-foot">Optimal time Thursday 6:40pm, your audience&apos;s peak.</p>
        </div>
      </div>
    </div>
  );
}
