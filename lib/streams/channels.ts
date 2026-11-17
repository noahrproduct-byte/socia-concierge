// Twitch channels as people paste them. Shared by the page and the server.

/** At most this many channels watched at once per person (Noah's reference: "paste in up to four live streams"). */
export const MAX_WATCHED = 4;

/** A channel login from what a person pastes: "xqc", "twitch.tv/xqc", "https://www.twitch.tv/xqc?x=1". Null when it isn't one. */
export function channelFromInput(input: string): string | null {
  const t = input.trim();
  const m = t.match(/^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]{3,25})(?:[/?#].*)?$/i) ?? t.match(/^@?([A-Za-z0-9_]{3,25})$/);
  if (!m) return null;
  const login = m[1].toLowerCase();
  // Twitch pages that aren't channels.
  if (["directory", "videos", "settings", "subscriptions", "inventory", "drops", "downloads", "jobs", "p", "search"].includes(login)) return null;
  return login;
}
