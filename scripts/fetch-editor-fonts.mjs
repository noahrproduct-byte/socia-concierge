// Downloads the editor's faces from Google Fonts as latin woff2 files into
// public/fonts/editor, with a manifest the editor reads (lib/editorFonts.ts).
// Every family is under the SIL Open Font License 1.1 (TikTok Sans: OFL too).
// Run once, commit the files; re-run to update. Node 18+, network needed.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FAMILIES = {
  inter: { family: "Inter", weights: [600, 700] },
  montserrat: { family: "Montserrat", weights: [600, 700, 800] },
  tiktok: { family: "TikTok Sans", weights: [600, 800] },
  anton: { family: "Anton", weights: [400] },
  poppins: { family: "Poppins", weights: [600, 700, 800] },
  playfair: { family: "Playfair Display", weights: [600, 700] },
  bebas: { family: "Bebas Neue", weights: [400] },
  nunito: { family: "Nunito", weights: [700, 800] },
  spacemono: { family: "Space Mono", weights: [400, 700] },
  instrument: { family: "Instrument Sans", weights: [600, 700] },
  // The Showroom theme (lib/studioClips/themes/showroom.json): heavy captions and a brush script for the key word.
  intertight: { family: "Inter Tight", weights: [800] },
  kaushan: { family: "Kaushan Script", weights: [400] },
};
const ITALIC = { serif: { family: "Instrument Serif", weights: [400], italic: true } };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const out = join(process.cwd(), "public", "fonts", "editor");
await mkdir(out, { recursive: true });
const manifest = [];
for (const [id, f] of Object.entries({ ...FAMILIES, ...ITALIC })) {
  const spec = f.italic ? `ital,wght@${f.weights.map((w) => `1,${w}`).join(";")}` : `wght@${f.weights.join(";")}`;
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:${spec}&display=swap`;
  const css = await (await fetch(url, { headers: { "user-agent": UA } })).text();
  // Each @font-face block: the latin one only. Google writes the subset's name as a comment just before its
  // block, so the block is read together with the comment that heads it (splitting on "@font-face" put each
  // comment at the end of the block before it, and every face fetched was the latin-ext subset: no ASCII
  // glyphs, so every caption fell back to a serif. 2026-11-14).
  const blocks = [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face\s*\{([^}]*)\}/g)].map((m) => ({ subset: m[1], body: m[2] }));
  for (const { subset, body: b } of blocks) {
    if (subset !== "latin") continue;
    const weight = Number(/font-weight:\s*(\d+)/.exec(b)?.[1] ?? 400);
    const style = /font-style:\s*italic/.test(b) ? "italic" : "normal";
    const src = /url\((https:[^)]+\.woff2)\)/.exec(b)?.[1];
    if (!src) continue;
    const file = `${id}-${weight}${style === "italic" ? "i" : ""}.woff2`;
    const bytes = Buffer.from(await (await fetch(src)).arrayBuffer());
    await writeFile(join(out, file), bytes);
    manifest.push({ id, family: f.family, weight, style, file, bytes: bytes.length });
    console.log(`${file} ${bytes.length} B`);
  }
}
await writeFile(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.length} faces`);
