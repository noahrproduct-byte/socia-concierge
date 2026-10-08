// "2.1×" / "0.8×": a result against the account's own median, with one
// decimal (two below 0.1). Client-safe; shared by results and Learn.
export const fmtMultiplier = (m: number): string => `${m >= 10 ? Math.round(m) : m >= 0.1 ? m.toFixed(1).replace(/\.0$/, "") : m.toFixed(2)}×`;
