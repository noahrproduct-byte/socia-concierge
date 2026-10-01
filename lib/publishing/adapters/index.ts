// Side-effect module: importing it registers every real publisher. The runner
// and the publish routes import this once; ensureAdapters() may be called any
// number of times (registration is idempotent by platform).

import { adapterFor, registerAdapter } from "../adapter";
import { instagramAdapter } from "./instagram";
import { youtubeAdapter } from "./youtube";
import { tiktokAdapter } from "./tiktok";
import { facebookAdapter } from "./facebook";

export function ensureAdapters(): void {
  if (!adapterFor("instagram")) registerAdapter(instagramAdapter);
  if (!adapterFor("youtube")) registerAdapter(youtubeAdapter);
  if (!adapterFor("tiktok")) registerAdapter(tiktokAdapter);
  if (!adapterFor("facebook")) registerAdapter(facebookAdapter);
}

ensureAdapters();
