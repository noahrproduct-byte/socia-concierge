// The props the composition is given: one builder for the Player (preview)
// and one for the browser export, so the two can only differ in what the
// export must not have (the safe-zone guide, the Before/After switch). The
// parity test (parity.test.ts) checks the plans frame by frame.
import type { BuildSource, Edl } from "./types";

export type RenderInputs = { edl: Edl; sources: Record<string, BuildSource>; musicUrl: string | null; voiceUrls: Record<string, string>; cleanAudio: Record<string, string>; watermarkUrl: string | null };

export const exportProps = (a: RenderInputs) => ({ edl: a.edl, sources: a.sources, captionsOn: Boolean(a.edl.captions), musicUrl: a.musicUrl, voiceUrls: a.voiceUrls, cleanAudio: a.cleanAudio, watermarkUrl: a.watermarkUrl });

// `preview` only tells the composition it is in the Player, where shots are drawn with the browser's video
// element (ClipComposition.tsx ShotVideo); the plan is the same.
export const previewProps = (a: RenderInputs & { finishOn: boolean; guide: boolean }) => ({ ...exportProps(a), finishOn: a.finishOn, safeZoneGuide: a.guide, preview: true as const });
