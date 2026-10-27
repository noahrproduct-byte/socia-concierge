// The hero's atmosphere: an illustration, not a CSS effect. The reference
// cuts large blurred colour geometry across a near-black canvas and then
// never uses colour again below the fold. For SOCIA the geometry is cobalt
// and sky on deep navy. It is decorative and hidden from assistive tech.

export default function HeroArt() {
  return (
    <svg className="hm-hero-art" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="hm-art-wash" cx="50%" cy="28%" r="62%">
          <stop offset="0" stopColor="#143ca3" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#02193b" stopOpacity="0.22" />
          <stop offset="1" stopColor="#040506" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hm-art-bar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2563ff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#2563ff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#63a1ff" stopOpacity="0" />
        </linearGradient>
        <filter id="hm-art-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="38" />
        </filter>
      </defs>
      <rect width="1440" height="900" fill="url(#hm-art-wash)" />
      <g filter="url(#hm-art-blur)" opacity="0.55">
        <rect x="-200" y="330" width="1840" height="56" fill="url(#hm-art-bar)" transform="rotate(-14 720 360)" />
        <rect x="-200" y="470" width="1840" height="26" fill="url(#hm-art-bar)" transform="rotate(-14 720 480)" opacity="0.7" />
        <rect x="-200" y="560" width="1840" height="90" fill="#02193b" transform="rotate(-14 720 600)" opacity="0.9" />
      </g>
    </svg>
  );
}
