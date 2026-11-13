// The nine shipped themes. To add one: drop a JSON file in this folder that
// follows schema.ts, import it below and add it to THEMES (docs/editor/THEMES.md).
import { parseTheme, type Theme } from "./schema";
import cleanMinimal from "./clean-minimal.json";
import boldHook from "./bold-hook.json";
import cinematic from "./cinematic.json";
import luxury from "./luxury.json";
import energetic from "./energetic.json";
import talkingHead from "./talking-head.json";
import retro from "./retro.json";
import sociaBrand from "./socia-brand.json";
import showroom from "./showroom.json";

export const THEMES: Theme[] = [showroom, cleanMinimal, boldHook, cinematic, luxury, energetic, talkingHead, retro, sociaBrand].map(parseTheme);

export const themeById = (id: string | null | undefined): Theme | null => THEMES.find((t) => t.id === id) ?? null;
export const isThemeId = (v: unknown): v is string => typeof v === "string" && THEMES.some((t) => t.id === v);
/** The theme every new cut starts with: the hand-cut rug reels' look (the owner, 2026-11-13: "make it edit like that"). */
export const DEFAULT_THEME_ID = "showroom";
export type { Theme } from "./schema";
