// Ask SOCIA streams its answer as JSON. While it is being written, this reads
// the "text" field out of the JSON so far, so the person sees the answer
// appear instead of waiting for the whole thing. Pure; safe on any prefix.

const ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

/** The (possibly unfinished) value of a top-level string field in partial JSON; null until the field has started. */
export function partialStringField(json: string, field: string): string | null {
  const m = new RegExp(`"${field}"\\s*:\\s*"`).exec(json);
  if (!m) return null;
  let out = "";
  for (let i = m.index + m[0].length; i < json.length; i++) {
    const c = json[i];
    if (c === '"') return out;
    if (c !== "\\") { out += c; continue; }
    const e = json[i + 1];
    if (e == null) return out; // the escape isn't complete yet
    if (e === "u") {
      const hex = json.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
    } else {
      out += ESCAPES[e] ?? e;
      i += 1;
    }
  }
  return out;
}
