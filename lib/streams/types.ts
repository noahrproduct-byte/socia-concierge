// What the Live streams tab shows (lib/streams/server.ts reads it). Shared by the page and the server.

export type TwitchConnection = { twitchUserId: string; login: string; displayName: string | null; avatarUrl: string | null; scopes: string[] };

export type StreamWatch = {
  id: string; channelId: string; login: string; name: string | null; avatarUrl: string | null;
  status: "watching" | "stopped"; live: boolean | null; streamTitle: string | null;
  messagesSeen: number; lastChatAt: string | null; watcherSeenAt: string | null;
  canDownload: boolean | null; lastError: string | null; startedAt: string; stoppedAt: string | null;
  /** the plan keeps the clip's video in SOCIA (Growth and up) */
  keepVideo: boolean;
};

export type StreamClip = {
  id: string; watchId: string; login: string; status: "making" | "ready" | "failed";
  twitchClipId: string | null; url: string | null; embedUrl: string | null; editUrl: string | null; thumbnailUrl: string | null;
  title: string | null; duration: number | null; spikeAt: string; score: number | null; why: string | null;
  people: number | null; hasVideo: boolean; error: string | null; createdAt: string;
};
