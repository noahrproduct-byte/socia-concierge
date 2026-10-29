// Storage paths a request may refer to. A path is the caller's only when it
// sits under one of their folders and has no tricks: no "..", "." or empty
// segments, no backslashes, no leading slash. Without the segment check
// "<me>/../<victim>/x.mp4" passes a plain prefix test.

/** True when `path` is a clean path under one of `owners`' folders. */
export function isOwnPath(path: string | null | undefined, owners: (string | null | undefined)[]): boolean {
  if (!path || typeof path !== "string" || path.length > 512) return false;
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/")) return false;
  const parts = path.split("/");
  if (parts.length < 2 || parts.some((p) => p === "" || p === "." || p === "..")) return false;
  return owners.some((o) => Boolean(o) && parts[0] === o);
}
