// Shared pentagon radar. Values are 0–100 per axis. Optionally renders a
// second, muted comparison series behind the primary one. Entry animation is
// driven by CSS: wrap in a Reveal (or any .in-toggling parent).
export default function RadarChart({
  values,
  axes,
  compare,
  size = 180,
}: {
  values: number[];
  axes: string[];
  compare?: number[];
  size?: number;
}) {
  const C = 90;
  const R = 62;
  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / values.length - Math.PI / 2;
    return `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
  };
  const ring = (frac: number) => values.map((_, i) => pt(i, R * frac)).join(" ");
  const poly = (vs: number[]) => vs.map((v, i) => pt(i, (v / 100) * R)).join(" ");
  return (
    <svg
      className="an2-radar"
      viewBox="0 0 180 180"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Profile radar"
    >
      {[0.33, 0.66, 1].map((f) => (
        <polygon key={f} points={ring(f)} className="an2-radar-ring" />
      ))}
      {values.map((_, i) => (
        <line
          key={i}
          x1={C}
          y1={C}
          x2={pt(i, R).split(",")[0]}
          y2={pt(i, R).split(",")[1]}
          className="an2-radar-spoke"
        />
      ))}
      {compare && <polygon points={poly(compare)} className="an2-radar-cmp" />}
      <polygon points={poly(values)} className="an2-radar-poly" />
      {values.map((v, i) => {
        const [x, y] = pt(i, (v / 100) * R).split(",").map(Number);
        return <circle key={i} cx={x} cy={y} r="2.4" className="an2-radar-dot" />;
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, R + 14).split(",").map(Number);
        return (
          <text key={a} x={x} y={y + 3} textAnchor="middle" className="an2-radar-label">
            {a}
          </text>
        );
      })}
    </svg>
  );
}
