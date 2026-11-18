// Makes a picked image small enough to keep with a cut as its logo
// (lib/studioClips/types.ts EdlLogo): drawn down to fit a square, kept as PNG
// so a see-through background stays see-through, and stepped smaller until it
// is under the size a cut may carry. Browser only.
import { LOGO_MAX_CHARS } from "./types";

const SIDES = [360, 280, 200, 140];

export async function logoFromFile(file: File): Promise<{ src: string } | { error: string }> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return { error: "Use a PNG, JPEG, WebP or SVG image." };
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error("unreadable")); img.src = url; });
    const w = img.naturalWidth || 512, h = img.naturalHeight || 512;
    for (const side of SIDES) {
      const k = Math.min(1, side / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
      const ctx = canvas.getContext("2d");
      if (!ctx) return { error: "This browser could not read the image." };
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const src = canvas.toDataURL("image/png");
      if (src.length <= LOGO_MAX_CHARS) return { src };
    }
    return { error: "This image is too detailed to keep as a logo. Try a simpler version of it." };
  } catch {
    return { error: "This image could not be read. Try a PNG." };
  } finally {
    URL.revokeObjectURL(url);
  }
}
