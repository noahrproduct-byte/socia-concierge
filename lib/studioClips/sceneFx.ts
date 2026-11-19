// The effects a scene can be (lib/studioClips/scenes.ts, kind "effect"): a
// treatment of the whole frame for a couple of seconds, on the word it is
// about. Most put something behind the person talking (the person is found
// in the picture and drawn again on top, as the graphics behind the person
// are); a few move the picture itself. Pure: ids, what each needs, bounds.

export const SCENE_FX = {
  cover: { label: "Magazine cover", what: "A masthead word across the top, behind the person.", person: true, text: "Masthead word", lines: 0 },
  glass: { label: "Glass text", what: "One big see-through word behind the person.", person: true, text: "Word", lines: 0 },
  graph: { label: "Graph rise", what: "A line chart climbing behind the person, with a tag on its peak.", person: true, text: "Tag on the peak", lines: 0 },
  news: { label: "News wall", what: "Headline clippings behind the person.", person: true, text: "First headline", lines: 3 },
  paper: { label: "Paper cut-out", what: "The person cut out with a white edge on a paper collage.", person: true, text: "Cut-out letters", lines: 0 },
  sketch: { label: "Sketch outline", what: "A hand-drawn line that wobbles around the person, with doodles.", person: true, text: "", lines: 0 },
  dolly: { label: "Dolly zoom", what: "The person pushes toward the camera while the room stays still.", person: true, text: "", lines: 0 },
  frame: { label: "Frame pop", what: "The video pops into a framed card.", person: false, text: "Line under the frame", lines: 0 },
  reveal: { label: "Pull-out reveal", what: "The video pulls back into a window.", person: false, text: "Window title", lines: 0 },
  phone: { label: "Phone frame", what: "A phone slides in behind the person with a few lines on its screen.", person: true, text: "Title on the screen", lines: 3 },
} as const;
export type SceneFxId = keyof typeof SCENE_FX;
export const SCENE_FX_IDS = Object.keys(SCENE_FX) as SceneFxId[];
export const isSceneFx = (v: unknown): v is SceneFxId => typeof v === "string" && Object.prototype.hasOwnProperty.call(SCENE_FX, v);
/** The effects that draw the person again on top. */
export const fxNeedsPerson = (id: SceneFxId): boolean => SCENE_FX[id].person;
export const FX_TEXT_MAX = 28;
export const FX_LINE_MAX = 48;
export const MAX_EFFECTS = 4;
