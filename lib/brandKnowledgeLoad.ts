// Reading a brand's website (lib/brandKnowledge.ts). The homepage and up to five linked pages about what
// it offers are fetched, only from public addresses (lib/clipper/sourceLength.ts isReadableLink, checked
// again on every redirect), within size and time limits, and read once by the model. Nothing of the pages
// is stored: only what the model wrote down, which the person can change.
//
// Server only.

import { isReadableLink } from "./clipper/sourceLength";
import { anthropic, FAST_MODEL, effortFor } from "./anthropic";
import { recordAiUsage } from "./aiUsage";
import { KNOWLEDGE_SCHEMA, KNOWLEDGE_SYSTEM, pageText, pagesToRead, sanitizeKnowledge, type BrandKnowledge } from "./brandKnowledge";

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const EXTRA_PAGES = 5;

export type SiteRead = { ok: true; pages: { url: string; text: string }[] } | { ok: false; reason: "unreadable" | "blocked" | "empty" };

/** One page's HTML, following up to three redirects that each stay on public addresses; null when it can't be read. */
async function fetchPage(url: string): Promise<{ url: string; html: string } | null> {
  let at = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isReadableLink(at))) return null;
    let res: Response;
    try {
      res = await fetch(at, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SOCIA website reader; +https://sociaos.com)", Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      try { at = new URL(loc, at).toString().replace(/^http:/, "https:"); } catch { return null; }
      continue;
    }
    if (!res.ok || !/text\/html|application\/xhtml/i.test(res.headers.get("content-type") ?? "")) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return null;
    const html = (await res.text().catch(() => "")).slice(0, MAX_BYTES);
    return html ? { url: at, html } : null;
  }
  return null;
}

/** The homepage and the pages it links to about what the business offers, as text. */
export async function readSite(url: string): Promise<SiteRead> {
  if (!(await isReadableLink(url))) return { ok: false, reason: "blocked" };
  const home = await fetchPage(url);
  if (!home) return { ok: false, reason: "unreadable" };
  const links = pagesToRead(home.html, home.url, EXTRA_PAGES);
  const more = await Promise.all(links.map((l) => fetchPage(l)));
  const pages = [home, ...more.filter((p): p is { url: string; html: string } => Boolean(p))]
    .map((p, i) => ({ url: p.url, text: pageText(p.html, i === 0 ? 12_000 : 8_000) }))
    .filter((p) => p.text.length > 40);
  return pages.length ? { ok: true, pages } : { ok: false, reason: "empty" };
}

/** What the model wrote down from the pages, or null when it found nothing. Throws on an AI failure (the route maps it). */
export async function learnFromPages(ownerId: string, site: string, pages: { url: string; text: string }[], now = new Date()): Promise<BrandKnowledge | null> {
  const content = pages.map((p) => `Page: ${p.url}\n<<<\n${p.text.replace(/<<<|>>>/g, "")}\n>>>`).join("\n\n");
  const params = {
    model: FAST_MODEL, max_tokens: 6000, system: KNOWLEDGE_SYSTEM,
    output_config: { format: { type: "json_schema", schema: KNOWLEDGE_SCHEMA }, ...effortFor(FAST_MODEL, "medium") },
    messages: [{ role: "user", content: `The website ${site}, ${pages.length} page${pages.length === 1 ? "" : "s"}:\n\n${content}` }],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.create(params as any);
  recordAiUsage(ownerId, "brand_knowledge", res);
  if (res.stop_reason === "refusal") return null;
  const block = res.content.find((b) => b.type === "text");
  const raw = block && "text" in block ? JSON.parse(block.text) : null;
  return sanitizeKnowledge({ ...raw, source: { url: site, pages: pages.map((p) => p.url), at: now.toISOString() }, updatedAt: now.toISOString() });
}
