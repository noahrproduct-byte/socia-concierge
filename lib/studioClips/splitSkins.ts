// The looks a split screen can wear (edl.scenesSkin): what the graphic field
// is made of and where the speaker sits under it. "socia" is SOCIA's own. The
// other four follow the split styles of Motus (github.com/kyleherbel/motus,
// MIT; see THIRD_PARTY_NOTICES.md): their grounds, inks, accents and the
// place of the speaker are taken from each style's tokens; the graphics in
// the field are SOCIA's own scenes, drawn in that look. Pure.

export type SplitSkin = {
  label: string; what: string;
  /** the share of the frame's height the graphic field takes */
  panel: number;
  bg: string; ink: string;
  /** the look's own accent; absent = the cut's accent */
  accent?: string;
  /** a fine pattern on the field */
  grid: "none" | "dots" | "lines";
  gridColor: string;
  /** an accent edge along the seam */
  seam: boolean;
  /** where the picture sits while a scene is up, on a 1080 by 1920 frame, and its corner radius */
  window: { x: number; y: number; w: number; h: number; r: number };
  /** the height of the picture kept in the middle of that window, as a share of the picture (0.5 = its middle) */
  focusY: number;
};

export const SPLIT_SKINS = {
  socia: { label: "SOCIA", what: "A dark panel with an accent edge; the speaker fills the rest.", panel: 0.4, bg: "#0b0c10", ink: "#ffffff", grid: "none", gridColor: "", seam: true, window: { x: 0, y: 768, w: 1080, h: 1152, r: 0 }, focusY: 0.5 },
  prop: { label: "Prop Room", what: "A pale paper panel over the speaker, half and half.", panel: 0.5, bg: "#f5f0ea", ink: "#212126", grid: "none", gridColor: "", seam: false, window: { x: 0, y: 960, w: 1080, h: 960, r: 0 }, focusY: 0.46 },
  editorial: { label: "Editorial Proof", what: "A clean white page above, the speaker in a rounded frame below.", panel: 0.52, bg: "#ffffff", ink: "#131416", accent: "#fe4d2e", grid: "none", gridColor: "", seam: false, window: { x: 41, y: 1030, w: 998, h: 850, r: 36 }, focusY: 0.45 },
  ember: { label: "Ember Brief", what: "A dark dotted field with magenta type over the speaker, half and half.", panel: 0.5, bg: "#121316", ink: "#edeef1", accent: "#ff3ab0", grid: "dots", gridColor: "#424346", seam: false, window: { x: 0, y: 960, w: 1080, h: 960, r: 0 }, focusY: 0.46 },
  night: { label: "Night Class", what: "A black teaching board with a cobalt accent; the speaker in a small rounded panel at the bottom.", panel: 0.72, bg: "#010101", ink: "#fefefe", accent: "#4274ff", grid: "lines", gridColor: "rgba(255,255,255,0.055)", seam: false, window: { x: 69, y: 1405, w: 942, h: 455, r: 46 }, focusY: 0.42 },
} as const satisfies Record<string, SplitSkin>;
export type SplitSkinId = keyof typeof SPLIT_SKINS;
export const SPLIT_SKIN_IDS = Object.keys(SPLIT_SKINS) as SplitSkinId[];
export const isSplitSkin = (v: unknown): v is SplitSkinId => typeof v === "string" && Object.prototype.hasOwnProperty.call(SPLIT_SKINS, v);
export const skinOf = (id: SplitSkinId | undefined): SplitSkin => SPLIT_SKINS[id ?? "socia"];

/**
 * Where the picture is at a share of the way into a split scene: the box it is clipped to (from the whole
 * frame to the skin's window) and how far the full-size picture is moved inside that box, so the band of
 * it around the person's face stays in view (`focus`, when the cut was looked at; else the skin's own guess).
 */
export function pictureWindow(skin: SplitSkin, share: number, width: number, height: number, focus?: number): { box: { left: number; top: number; width: number; height: number; borderRadius: number }; inner: { left: number; top: number } } {
  const kx = width / 1080, ky = height / 1920, w = skin.window;
  const box = { left: w.x * kx * share, top: w.y * ky * share, width: width - (width - w.w * kx) * share, height: height - (height - w.h * ky) * share, borderRadius: w.r * kx * share };
  // At a full share the window's own top-left is the origin: the picture is centred across it and its focus band sits in the middle.
  const inner = { left: -((width - w.w * kx) / 2) * share, top: -Math.max(0, Math.min(height - w.h * ky, (focus ?? skin.focusY) * height - (w.h * ky) / 2)) * share };
  return { box, inner };
}
