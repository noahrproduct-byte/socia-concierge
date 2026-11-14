// The parts of SOCIA's Reel read (./reelRead.ts) that pages may import: the
// kinds of video and the shape of the read. Pure, no server modules.

/** How a kind of video is made. */
export const MADE = ["animated", "filmed", "screen", "photo", "text", "mixed"] as const;
export type Made = (typeof MADE)[number];
export const MADE_LABEL: Record<Made, string> = {
  animated: "Animated",
  filmed: "Filmed",
  screen: "Screen recording",
  photo: "Photos",
  text: "Text on screen",
  mixed: "Mixed",
};

export type VisualFormat = {
  name: string;
  made: Made;
  /** What it looks like: scenes, characters, colours, type, logo, layout. */
  look: string;
  /** The Reels of this kind (Instagram media ids) among those watched. */
  ids: string[];
  /** Counted from the Reels above: average views (or interactions when views are missing), and against the account's usual. */
  avg: number | null;
  metric: "views" | "interactions";
  multiple: number | null;
  /** One example: its link and cover at the time of the read. */
  example: { permalink: string | null; thumb: string | null } | null;
};

export type VisualRead = {
  read_at: string;
  reels: number;
  /** What the account is, and what it sells or makes, in plain words. */
  about: { value: string; product: string | null; confidence: number; evidence: string[] } | null;
  formats: VisualFormat[];
  /** The account's look across its videos: colours, type, logo, recurring characters. */
  look: string | null;
  limitations: string[];
};

