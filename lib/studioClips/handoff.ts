// A file passed from one part of Content Studio to another in this tab (Rate
// → Audio: "Add music to this video"), so the person doesn't pick it again.
// Memory only; gone on a reload. Client only.
let pending: { files: File[]; to: string } | null = null;

export function handFiles(to: string, files: File[]): void {
  pending = { files, to };
}

/** The files handed to this part, once. */
export function takeFiles(to: string): File[] {
  if (!pending || pending.to !== to) return [];
  const f = pending.files;
  pending = null;
  return f;
}
