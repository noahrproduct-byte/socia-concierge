// The SOCIA mark's outlines, traced from public/brand/socia-mark.png (512 px
// square): the two ribbons of the S and the four-point star. The intro's
// strands lay themselves along these lines, then the real mark fills them.
// Re-trace if the mark changes.

export type Pt = [number, number];

export const MARK_SIZE = 512;

/** The lower ribbon of the S, the larger shape. */
export const S_LOWER: Pt[] = [
  [353, 239], [340, 226], [297, 200], [292, 201], [247, 226], [315, 266], [320, 272], [321, 281], [314, 290],
  [225, 338], [223, 361], [216, 361], [195, 352], [177, 337], [171, 344], [166, 358], [167, 371], [173, 383],
  [179, 389], [190, 395], [200, 397], [211, 396], [233, 386], [338, 330], [356, 311], [365, 287], [364, 262],
];

/** The upper ribbon of the S. */
export const S_UPPER: Pt[] = [
  [290, 118], [175, 180], [162, 193], [153, 211], [151, 220], [152, 239], [164, 262], [179, 275], [229, 304],
  [274, 279], [202, 239], [198, 235], [196, 227], [202, 218], [290, 170],
];

/** The star, top point first, clockwise. */
export const STAR: Pt[] = [
  [344, 99], [351, 119], [363, 130], [376, 135], [365, 138], [352, 149], [346, 162], [345, 173], [342, 159],
  [335, 147], [320, 137], [310, 135], [327, 129], [337, 120], [343, 108],
];

/** Evenly spaced points along part of a closed outline, `from` and `to` as fractions of its length. */
export function alongOutline(poly: Pt[], from: number, to: number, n: number): Pt[] {
  const segs = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const total = segs.reduce((a, b) => a + b, 0);
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    let d = (((from + ((to - from) * k) / (n - 1)) % 1) + 1) % 1 * total;
    let i = 0;
    while (i < segs.length - 1 && d > segs[i]) d -= segs[i++];
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = segs[i] ? d / segs[i] : 0;
    out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
  }
  return out;
}
